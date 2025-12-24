// ============================================================
// SYNAPSE WebSocket Server
// Real-time bidding and intent status updates
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

interface ClientSocket extends Socket {
  clientAddress?: string;
  subscribedIntents: Set<string>;
  isProvider: boolean;
  providerId?: string;
}

export function setupWebSocket(
  io: SocketIOServer,
  intentEngine: IntentEngine,
  providerRegistry: ProviderRegistry
): void {
  // Track connected clients
  const clients = new Map<string, ClientSocket>();
  const providerSockets = new Map<string, string>(); // providerId -> socketId

  io.on('connection', (socket: Socket) => {
    const clientSocket = socket as ClientSocket;
    clientSocket.subscribedIntents = new Set();
    clientSocket.isProvider = false;

    console.log(`Client connected: ${socket.id}`);

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

    // -------------------- PING/PONG --------------------

    socket.on(WSEventType.PING, () => {
      socket.emit(WSEventType.PONG, {
        type: WSEventType.PONG,
        payload: { timestamp: Date.now() },
        timestamp: Date.now()
      } as WSMessage);
    });

    // -------------------- DISCONNECT --------------------

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);

      // Clean up provider mapping
      if (clientSocket.providerId) {
        providerSockets.delete(clientSocket.providerId);
      }

      clients.delete(socket.id);
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

  console.log('WebSocket server initialized');
}

// Type augmentation for io with broadcast helpers
declare module 'socket.io' {
  interface Server {
    broadcastToIntent(intentId: string, event: WSEventType, payload: unknown): void;
    broadcastToCapability(capability: string, event: WSEventType, payload: unknown): void;
    broadcastToProviders(event: WSEventType, payload: unknown): void;
    sendToProvider(providerId: string, event: WSEventType, payload: unknown): void;
  }
}
