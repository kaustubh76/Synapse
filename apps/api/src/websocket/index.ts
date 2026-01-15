// ============================================================
// SYNAPSE WebSocket Server
// Real-time bidding and intent status updates
// Features:
// - Message batching for efficiency
// - Backpressure handling for slow clients
// - Connection health monitoring
// ============================================================

import { Server as SocketIOServer, Socket } from 'socket.io';
import {
  IntentEngine,
  ProviderRegistry,
  WSEventType,
  WSMessage,
  Intent,
  Bid
} from '@synapse/core';

// Message batching configuration
const BATCH_INTERVAL_MS = 100; // Batch messages within 100ms windows
const MAX_BATCH_SIZE = 50;     // Max messages per batch
const BACKPRESSURE_THRESHOLD = 100; // Messages queued before dropping low-priority

// Message priority levels
enum MessagePriority {
  HIGH = 0,    // winner_selected, intent_completed, errors
  MEDIUM = 1,  // bid_received, intent_updated
  LOW = 2,     // heartbeats, stats updates
}

// Queued message for batching
interface QueuedMessage {
  event: string;
  payload: unknown;
  priority: MessagePriority;
  timestamp: number;
}

// Extended socket with additional tracking
interface ClientSocket extends Socket {
  clientAddress?: string;
  subscribedIntents: Set<string>;
  isProvider: boolean;
  providerId?: string;
  messageQueue: QueuedMessage[];
  lastFlush: number;
  droppedMessages: number;
  isHealthy: boolean;
}

// Get priority for an event type
function getEventPriority(event: string): MessagePriority {
  switch (event) {
    case WSEventType.WINNER_SELECTED:
    case WSEventType.INTENT_COMPLETED:
    case WSEventType.INTENT_FAILED:
    case WSEventType.ERROR:
      return MessagePriority.HIGH;

    case WSEventType.BID_RECEIVED:
    case WSEventType.INTENT_UPDATED:
    case WSEventType.FAILOVER_TRIGGERED:
      return MessagePriority.MEDIUM;

    default:
      return MessagePriority.LOW;
  }
}

// WebSocket server statistics
interface WSStats {
  totalConnections: number;
  activeConnections: number;
  providerConnections: number;
  dashboardConnections: number;
  messagesSent: number;
  messagesBatched: number;
  messagesDropped: number;
  avgBatchSize: number;
}

let wsStats: WSStats = {
  totalConnections: 0,
  activeConnections: 0,
  providerConnections: 0,
  dashboardConnections: 0,
  messagesSent: 0,
  messagesBatched: 0,
  messagesDropped: 0,
  avgBatchSize: 0,
};

export function setupWebSocket(
  io: SocketIOServer,
  intentEngine: IntentEngine,
  providerRegistry: ProviderRegistry
): void {
  // Track connected clients
  const clients = new Map<string, ClientSocket>();
  const providerSockets = new Map<string, string>(); // providerId -> socketId

  // Batch flush timer
  let flushTimer: NodeJS.Timeout | null = null;

  /**
   * Queue a message for batched sending to a client
   */
  function queueMessage(clientSocket: ClientSocket, event: string, payload: unknown): void {
    const priority = getEventPriority(event);

    // Backpressure: drop low-priority messages if queue is full
    if (clientSocket.messageQueue.length >= BACKPRESSURE_THRESHOLD) {
      if (priority === MessagePriority.LOW) {
        clientSocket.droppedMessages++;
        wsStats.messagesDropped++;
        return; // Drop the message
      }
      // For medium/high priority, remove oldest low-priority messages
      const lowPriorityIdx = clientSocket.messageQueue.findIndex(
        (m) => m.priority === MessagePriority.LOW
      );
      if (lowPriorityIdx !== -1) {
        clientSocket.messageQueue.splice(lowPriorityIdx, 1);
        clientSocket.droppedMessages++;
        wsStats.messagesDropped++;
      }
    }

    clientSocket.messageQueue.push({
      event,
      payload,
      priority,
      timestamp: Date.now(),
    });

    wsStats.messagesBatched++;
  }

  /**
   * Flush queued messages for a client
   */
  function flushMessages(clientSocket: ClientSocket): void {
    if (clientSocket.messageQueue.length === 0) return;

    // Sort by priority (HIGH first)
    clientSocket.messageQueue.sort((a, b) => a.priority - b.priority);

    // Take up to MAX_BATCH_SIZE messages
    const batch = clientSocket.messageQueue.splice(0, MAX_BATCH_SIZE);

    // Group messages by event type for efficiency
    const grouped = new Map<string, unknown[]>();
    for (const msg of batch) {
      if (!grouped.has(msg.event)) {
        grouped.set(msg.event, []);
      }
      grouped.get(msg.event)!.push(msg.payload);
    }

    // Send grouped messages
    for (const [event, payloads] of grouped) {
      if (payloads.length === 1) {
        // Single message - send normally
        clientSocket.emit(event, {
          type: event,
          payload: payloads[0],
          timestamp: Date.now(),
        } as WSMessage);
      } else {
        // Multiple messages - send as batch
        clientSocket.emit(`${event}_batch`, {
          type: `${event}_batch`,
          payload: payloads,
          count: payloads.length,
          timestamp: Date.now(),
        });
      }
      wsStats.messagesSent += payloads.length;
    }

    // Update stats
    if (batch.length > 0) {
      wsStats.avgBatchSize =
        (wsStats.avgBatchSize * 0.9) + (batch.length * 0.1); // EMA
    }

    clientSocket.lastFlush = Date.now();
  }

  /**
   * Flush all client message queues
   */
  function flushAllClients(): void {
    for (const client of clients.values()) {
      if (client.isHealthy && client.messageQueue.length > 0) {
        flushMessages(client);
      }
    }
  }

  // Start batch flush timer
  flushTimer = setInterval(flushAllClients, BATCH_INTERVAL_MS);

  io.on('connection', (socket: Socket) => {
    const clientSocket = socket as ClientSocket;
    clientSocket.subscribedIntents = new Set();
    clientSocket.isProvider = false;
    clientSocket.messageQueue = [];
    clientSocket.lastFlush = Date.now();
    clientSocket.droppedMessages = 0;
    clientSocket.isHealthy = true;

    wsStats.totalConnections++;
    wsStats.activeConnections++;

    console.log(`Client connected: ${socket.id} (active: ${wsStats.activeConnections})`);

    // Send welcome message
    socket.emit(WSEventType.CONNECTED, {
      type: WSEventType.CONNECTED,
      payload: {
        socketId: socket.id,
        message: 'Connected to Synapse Intent Network'
      },
      timestamp: Date.now()
    } as WSMessage);

    clients.set(socket.id, clientSocket);

    // -------------------- DASHBOARD EVENTS --------------------

    // Dashboard clients join this room to receive all broadcast events
    socket.on('join_dashboard', () => {
      socket.join('dashboard');
      wsStats.dashboardConnections++;
      console.log(`Dashboard client ${socket.id} joined dashboard room`);

      // Send current network stats
      const stats = {
        totalProviders: providerRegistry.getStats().total,
        onlineProviders: providerRegistry.getStats().online,
        openIntents: intentEngine.getOpenIntents().length,
      };
      socket.emit('network_stats', {
        type: 'network_stats',
        payload: stats,
        timestamp: Date.now()
      });
    });

    socket.on('leave_dashboard', () => {
      socket.leave('dashboard');
      wsStats.dashboardConnections = Math.max(0, wsStats.dashboardConnections - 1);
    });

    // -------------------- CLIENT EVENTS --------------------

    // Subscribe to intent updates
    socket.on(WSEventType.SUBSCRIBE_INTENT, (data: { intentId: string }) => {
      const { intentId } = data;
      clientSocket.subscribedIntents.add(intentId);
      socket.join(`intent:${intentId}`);
      console.log(`Client ${socket.id} subscribed to intent ${intentId}`);

      // Send current intent state
      const intent = intentEngine.getIntent(intentId);
      if (intent) {
        const bids = intentEngine.getBidsForIntent(intentId);
        socket.emit(WSEventType.INTENT_CREATED, {
          type: WSEventType.INTENT_CREATED,
          payload: { intent, bids },
          timestamp: Date.now()
        } as WSMessage<{ intent: Intent; bids: Bid[] }>);
      }
    });

    // Unsubscribe from intent
    socket.on(WSEventType.UNSUBSCRIBE_INTENT, (data: { intentId: string }) => {
      const { intentId } = data;
      clientSocket.subscribedIntents.delete(intentId);
      socket.leave(`intent:${intentId}`);
      console.log(`Client ${socket.id} unsubscribed from intent ${intentId}`);
    });

    // -------------------- PROVIDER EVENTS --------------------

    // Provider registration
    socket.on(WSEventType.SUBSCRIBE_PROVIDER, (data: {
      providerId: string;
      address: string;
      capabilities: string[];
    }) => {
      const { providerId, address, capabilities } = data;

      clientSocket.isProvider = true;
      clientSocket.providerId = providerId;
      clientSocket.clientAddress = address;

      // Map provider to socket
      providerSockets.set(providerId, socket.id);

      // Join provider room and capability rooms
      socket.join('providers');
      capabilities.forEach(cap => {
        socket.join(`capability:${cap}`);
      });

      // Start heartbeat
      providerRegistry.heartbeatByAddress(address);

      // Track stats
      wsStats.providerConnections++;

      console.log(`Provider ${providerId} connected with capabilities: ${capabilities.join(', ')}`);

      // Send current open intents
      const openIntents = intentEngine.getOpenIntents()
        .filter(intent => capabilities.some(cap =>
          intent.type === cap || intent.type.startsWith(cap.split('.')[0])
        ));

      if (openIntents.length > 0) {
        socket.emit(WSEventType.NEW_INTENT_AVAILABLE, {
          type: WSEventType.NEW_INTENT_AVAILABLE,
          payload: { intents: openIntents },
          timestamp: Date.now()
        } as WSMessage<{ intents: Intent[] }>);
      }
    });

    // Provider heartbeat
    socket.on('heartbeat', () => {
      if (clientSocket.providerId) {
        providerRegistry.heartbeat(clientSocket.providerId);
      }
    });

    // -------------------- BIDDING EVENTS --------------------

    // Submit bid via WebSocket (alternative to HTTP)
    socket.on('submit_bid', async (data: {
      intentId: string;
      bidAmount: number;
      estimatedTime: number;
      confidence: number;
    }) => {
      if (!clientSocket.isProvider || !clientSocket.providerId) {
        socket.emit(WSEventType.ERROR, {
          type: WSEventType.ERROR,
          payload: { code: 'NOT_PROVIDER', message: 'Must be registered as provider' },
          timestamp: Date.now()
        } as WSMessage);
        return;
      }

      const provider = providerRegistry.getProvider(clientSocket.providerId);
      if (!provider) {
        socket.emit(WSEventType.ERROR, {
          type: WSEventType.ERROR,
          payload: { code: 'PROVIDER_NOT_FOUND', message: 'Provider not registered' },
          timestamp: Date.now()
        } as WSMessage);
        return;
      }

      const bid = intentEngine.submitBid(
        {
          intentId: data.intentId,
          bidAmount: data.bidAmount,
          estimatedTime: data.estimatedTime,
          confidence: data.confidence
        },
        {
          address: provider.address,
          id: provider.id,
          reputationScore: provider.reputationScore,
          teeAttested: provider.teeAttested,
          capabilities: provider.capabilities
        }
      );

      if (bid) {
        socket.emit('bid_accepted', {
          type: 'bid_accepted',
          payload: { bid },
          timestamp: Date.now()
        });
      } else {
        socket.emit(WSEventType.ERROR, {
          type: WSEventType.ERROR,
          payload: { code: 'BID_REJECTED', message: 'Bid was rejected' },
          timestamp: Date.now()
        } as WSMessage);
      }
    });

    // -------------------- PING/PONG & HEARTBEAT --------------------

    // Handle ping from protocol (WSEventType.PING)
    socket.on(WSEventType.PING, () => {
      socket.emit(WSEventType.PONG, {
        type: WSEventType.PONG,
        payload: { timestamp: Date.now() },
        timestamp: Date.now()
      } as WSMessage);
    });

    // Handle simple ping from client heartbeat mechanism
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // -------------------- DISCONNECT --------------------

    socket.on('disconnect', () => {
      wsStats.activeConnections--;

      // Track provider disconnections
      if (clientSocket.isProvider) {
        wsStats.providerConnections--;
      }

      // Log with stats
      const dropped = clientSocket.droppedMessages;
      console.log(
        `Client disconnected: ${socket.id} ` +
        `(active: ${wsStats.activeConnections}, dropped: ${dropped})`
      );

      // Clean up provider mapping
      if (clientSocket.providerId) {
        providerSockets.delete(clientSocket.providerId);
      }

      clients.delete(socket.id);
    });

    // Monitor connection health
    socket.on('error', (err) => {
      console.error(`Socket error for ${socket.id}:`, err);
      clientSocket.isHealthy = false;
    });
  });

  // -------------------- BROADCAST HELPERS --------------------

  // Broadcast to all clients subscribed to an intent
  (io as any).broadcastToIntent = (intentId: string, event: WSEventType, payload: unknown) => {
    io.to(`intent:${intentId}`).emit(event, {
      type: event,
      payload,
      timestamp: Date.now()
    } as WSMessage);
  };

  // Broadcast to all providers with a capability
  (io as any).broadcastToCapability = (capability: string, event: WSEventType, payload: unknown) => {
    io.to(`capability:${capability}`).emit(event, {
      type: event,
      payload,
      timestamp: Date.now()
    } as WSMessage);
  };

  // Broadcast to all providers
  (io as any).broadcastToProviders = (event: WSEventType, payload: unknown) => {
    io.to('providers').emit(event, {
      type: event,
      payload,
      timestamp: Date.now()
    } as WSMessage);
  };

  // Send to specific provider
  (io as any).sendToProvider = (providerId: string, event: WSEventType, payload: unknown) => {
    const socketId = providerSockets.get(providerId);
    if (socketId) {
      io.to(socketId).emit(event, {
        type: event,
        payload,
        timestamp: Date.now()
      } as WSMessage);
    }
  };

  // Expose stats getter
  (io as any).getWSStats = (): WSStats => ({ ...wsStats });

  // Cleanup function for graceful shutdown
  (io as any).cleanup = () => {
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    // Flush any remaining messages
    flushAllClients();
  };

  console.log('WebSocket server initialized with message batching');
}

// Export stats getter for external use
export function getWSStats(): WSStats {
  return { ...wsStats };
}

// Type augmentation for io with broadcast helpers
declare module 'socket.io' {
  interface Server {
    broadcastToIntent(intentId: string, event: WSEventType, payload: unknown): void;
    broadcastToCapability(capability: string, event: WSEventType, payload: unknown): void;
    getWSStats(): WSStats;
    cleanup(): void;
    broadcastToProviders(event: WSEventType, payload: unknown): void;
    sendToProvider(providerId: string, event: WSEventType, payload: unknown): void;
  }
}
