// ============================================================
// SYNAPSE Provider SDK
// Easy integration for building provider bots
// ============================================================

import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'eventemitter3';

// Simple ID generator (no external ESM dependencies)
function generateId(length: number = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
import {
  Intent,
  Bid,
  WSEventType,
  WSMessage,
  IntentStatus,
  Provider
} from '@synapse/types';

export interface ProviderConfig {
  /** Synapse API URL */
  apiUrl: string;
  /** Provider name */
  name: string;
  /** Provider description */
  description: string;
  /** Capabilities this provider can handle */
  capabilities: string[];
  /** Provider wallet address (or generated if not provided) */
  walletAddress?: string;
  /** Local API endpoint for direct calls */
  endpoint?: string;
  /** Auto-connect on creation */
  autoConnect?: boolean;
  /** TEE attestation (if available) */
  teeAttestation?: string;
}

export interface BidStrategy {
  /** Base bid amount in USDC */
  baseBid: number;
  /** Percentage of max budget to bid (0-1) */
  budgetPercentage?: number;
  /** Minimum bid amount */
  minBid?: number;
  /** Maximum bid amount */
  maxBid?: number;
  /** Confidence level (0-100) */
  confidence?: number;
  /** Estimated execution time in ms */
  estimatedTime?: number;
}

export interface ExecutionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  executionTime?: number;
}

export interface ProviderEvents {
  connected: () => void;
  disconnected: () => void;
  registered: (providerId: string) => void;
  intentReceived: (intent: Intent) => void;
  bidSubmitted: (bid: Bid) => void;
  bidAccepted: (bid: Bid, intent: Intent) => void;
  bidRejected: (intentId: string, reason: string) => void;
  intentAssigned: (intent: Intent) => void;
  executionStarted: (intent: Intent) => void;
  executionCompleted: (intent: Intent, result: any) => void;
  executionFailed: (intent: Intent, error: string) => void;
  paymentReceived: (amount: number, txHash: string) => void;
  error: (error: Error) => void;
}

type IntentHandler<T = unknown> = (
  intent: Intent,
  params: Record<string, unknown>
) => Promise<ExecutionResult<T>>;

/**
 * Synapse Provider SDK
 *
 * Makes it easy to build provider bots that can:
 * - Connect to the Synapse network
 * - Listen for intents matching their capabilities
 * - Submit competitive bids
 * - Execute intents and submit results
 * - Handle payments
 *
 * Usage:
 * ```typescript
 * const provider = new SynapseProvider({
 *   apiUrl: 'http://localhost:3001',
 *   name: 'MyWeatherBot',
 *   description: 'Premium weather data provider',
 *   capabilities: ['weather.current', 'weather.forecast']
 * });
 *
 * // Register intent handler
 * provider.onIntent('weather.current', async (intent, params) => {
 *   const data = await getWeatherData(params.city);
 *   return { success: true, data };
 * });
 *
 * // Set bid strategy
 * provider.setBidStrategy({
 *   baseBid: 0.005,
 *   budgetPercentage: 0.3,
 *   confidence: 95
 * });
 *
 * await provider.start();
 * ```
 */
export class SynapseProvider extends EventEmitter<ProviderEvents> {
  private config: ProviderConfig;
  private socket: Socket | null = null;
  private providerId: string | null = null;
  private walletAddress: string;
  private isConnected = false;
  private isRegistered = false;
  private intentHandlers: Map<string, IntentHandler> = new Map();
  private defaultHandler: IntentHandler | null = null;
  private bidStrategy: BidStrategy = {
    baseBid: 0.005,
    budgetPercentage: 0.3,
    minBid: 0.001,
    confidence: 90,
    estimatedTime: 500
  };
  private reputationScore = 4.5;
  private teeAttested = false;
  private pendingIntents: Set<string> = new Set();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private stats = {
    intentsReceived: 0,
    bidsMade: 0,
    bidsWon: 0,
    jobsCompleted: 0,
    jobsFailed: 0,
    totalEarnings: 0
  };

  constructor(config: ProviderConfig) {
    super();
    this.config = {
      autoConnect: true,
      ...config
    };
    this.walletAddress = config.walletAddress || `0x${config.name.replace(/\s+/g, '')}_${generateId(8)}`;
    this.teeAttested = !!config.teeAttestation;
  }

  /**
   * Start the provider (connect and register)
   */
  async start(): Promise<void> {
    await this.connect();
    await this.register();
    this.startHeartbeat();
  }

  /**
   * Start heartbeat to keep provider online
   */
  private startHeartbeat(): void {
    // Clear existing interval if any
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Send heartbeat every 10 seconds (server timeout is 30s)
    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.isConnected) {
        this.socket.emit('heartbeat');
      }
    }, 10000);
  }

  /**
   * Connect to Synapse network
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(this.config.apiUrl, {
        transports: ['websocket', 'polling']
      });

      this.socket.on('connect', () => {
        console.log(`[${this.config.name}] Connected to Synapse`);
        this.isConnected = true;
        this.setupEventListeners();
        this.emit('connected');
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error(`[${this.config.name}] Connection error:`, error);
        this.emit('error', error);
        reject(error);
      });

      this.socket.on('disconnect', () => {
        console.log(`[${this.config.name}] Disconnected`);
        this.isConnected = false;
        this.emit('disconnected');
      });
    });
  }

  /**
   * Register as a provider
   */
  async register(): Promise<string> {
    const response = await fetch(`${this.config.apiUrl}/api/providers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: this.config.name,
        description: this.config.description,
        capabilities: this.config.capabilities,
        endpoint: this.config.endpoint,
        address: this.walletAddress
      })
    });

    const result = await response.json();

    if (result.success) {
      this.providerId = result.data.id;
      this.isRegistered = true;
      console.log(`[${this.config.name}] Registered: ${this.providerId}`);

      // Subscribe to provider events
      if (this.socket) {
        this.socket.emit(WSEventType.SUBSCRIBE_PROVIDER, {
          providerId: this.providerId,
          address: this.walletAddress,
          capabilities: this.config.capabilities
        });
      }

      this.emit('registered', this.providerId!);
      return this.providerId!;
    } else {
      throw new Error(`Registration failed: ${result.error?.message}`);
    }
  }

  /**
   * Setup WebSocket event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Listen for new intents
    this.socket.on(WSEventType.NEW_INTENT_AVAILABLE, (message: WSMessage<any>) => {
      if (message.payload?.intent) {
        this.handleNewIntent(message.payload.intent);
      }
      if (message.payload?.intents) {
        message.payload.intents.forEach((intent: Intent) => this.handleNewIntent(intent));
      }
    });

    // Listen for winner selection
    this.socket.on(WSEventType.WINNER_SELECTED, (message: WSMessage<any>) => {
      if (message.payload?.winner?.providerAddress === this.walletAddress) {
        console.log(`[${this.config.name}] Won intent ${message.payload.intent.id}!`);
        this.stats.bidsWon++;
        this.emit('intentAssigned', message.payload.intent);
        this.executeIntent(message.payload.intent);
      }
    });

    // Listen for intent assignment (only execute if assigned to us)
    this.socket.on(WSEventType.INTENT_ASSIGNED, (message: WSMessage<any>) => {
      if (message.payload?.intent && message.payload?.providerAddress === this.walletAddress) {
        console.log(`[${this.config.name}] Assigned intent ${message.payload.intent.id}!`);
        this.executeIntent(message.payload.intent);
      }
    });

    // Listen for failover - we might be the backup provider
    this.socket.on(WSEventType.FAILOVER_TRIGGERED, (message: WSMessage<any>) => {
      if (message.payload?.newProvider === this.walletAddress) {
        console.log(`[${this.config.name}] Failover - assigned intent ${message.payload.intent.id}!`);
        this.stats.bidsWon++;
        this.emit('intentAssigned', message.payload.intent);
        this.executeIntent(message.payload.intent);
      }
    });

    // Listen for payment
    this.socket.on(WSEventType.PAYMENT_SETTLED, (message: WSMessage<any>) => {
      if (message.payload?.provider === this.walletAddress) {
        const amount = message.payload.amount;
        const txHash = message.payload.transactionHash;
        this.stats.totalEarnings += amount;
        console.log(`[${this.config.name}] Payment: $${amount} (tx: ${txHash})`);
        this.emit('paymentReceived', amount, txHash);
      }
    });
  }

  /**
   * Handle new intent notification
   */
  private async handleNewIntent(intent: Intent): Promise<void> {
    if (intent.status !== IntentStatus.OPEN) return;
    if (this.pendingIntents.has(intent.id)) return;

    // Check if we can handle this intent
    const canHandle = this.config.capabilities.some(cap =>
      intent.type === cap || intent.type.startsWith(cap.split('.')[0])
    );

    if (!canHandle) return;

    this.stats.intentsReceived++;
    this.pendingIntents.add(intent.id);
    console.log(`[${this.config.name}] Intent received: ${intent.type} (Budget: $${intent.maxBudget})`);
    this.emit('intentReceived', intent);

    // Submit bid
    await this.submitBid(intent);
  }

  /**
   * Submit a bid for an intent
   */
  async submitBid(intent: Intent): Promise<Bid | null> {
    const bidAmount = this.calculateBidAmount(intent);
    const estimatedTime = this.bidStrategy.estimatedTime || 500;

    console.log(`[${this.config.name}] Submitting bid: $${bidAmount.toFixed(4)}`);

    try {
      const response = await fetch(`${this.config.apiUrl}/api/intents/${intent.id}/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bidAmount,
          estimatedTime,
          confidence: this.bidStrategy.confidence || 90,
          providerAddress: this.walletAddress,
          providerId: this.providerId,
          reputationScore: this.reputationScore,
          teeAttested: this.teeAttested,
          capabilities: this.config.capabilities
        })
      });

      const result = await response.json();

      if (result.success) {
        this.stats.bidsMade++;
        console.log(`[${this.config.name}] Bid accepted: ${result.data.id} (Score: ${result.data.calculatedScore})`);

        // Subscribe to intent updates to receive winner selection
        if (this.socket) {
          this.socket.emit(WSEventType.SUBSCRIBE_INTENT, { intentId: intent.id });
        }

        this.emit('bidSubmitted', result.data);
        this.emit('bidAccepted', result.data, intent);
        return result.data;
      } else {
        console.log(`[${this.config.name}] Bid rejected: ${result.error?.message}`);
        this.emit('bidRejected', intent.id, result.error?.message || 'Unknown error');
        return null;
      }
    } catch (error) {
      console.error(`[${this.config.name}] Bid error:`, error);
      return null;
    } finally {
      this.pendingIntents.delete(intent.id);
    }
  }

  /**
   * Calculate bid amount based on strategy
   */
  private calculateBidAmount(intent: Intent): number {
    const { baseBid, budgetPercentage, minBid, maxBid } = this.bidStrategy;

    // Calculate competitive bid
    let bid = baseBid;

    if (budgetPercentage) {
      bid = Math.min(bid, intent.maxBudget * budgetPercentage);
    }

    // Add small random variation for competition
    const variation = (Math.random() - 0.5) * 0.002;
    bid += variation;

    // Apply limits
    if (minBid) bid = Math.max(minBid, bid);
    if (maxBid) bid = Math.min(maxBid, bid);

    // Don't exceed budget
    bid = Math.min(bid, intent.maxBudget);

    return bid;
  }

  /**
   * Execute an intent
   */
  private async executeIntent(intent: Intent): Promise<void> {
    console.log(`[${this.config.name}] Executing intent ${intent.id}...`);
    this.emit('executionStarted', intent);

    const startTime = Date.now();

    try {
      // Find handler for this intent type
      let handler = this.intentHandlers.get(intent.type);

      // Try prefix match
      if (!handler) {
        const prefix = intent.type.split('.')[0];
        for (const [key, h] of this.intentHandlers) {
          if (key.startsWith(prefix) || intent.type.startsWith(key)) {
            handler = h;
            break;
          }
        }
      }

      // Use default handler if no specific one
      if (!handler) {
        handler = this.defaultHandler || this.createDefaultHandler();
      }

      // Execute handler
      const result = await handler(intent, intent.params);
      const executionTime = Date.now() - startTime;

      if (result.success) {
        // Submit result to Synapse
        await this.submitResult(intent, result.data, executionTime);
        this.stats.jobsCompleted++;
        console.log(`[${this.config.name}] Completed in ${executionTime}ms`);
        this.emit('executionCompleted', intent, result.data);
      } else {
        this.stats.jobsFailed++;
        console.log(`[${this.config.name}] Failed: ${result.error}`);
        this.emit('executionFailed', intent, result.error || 'Unknown error');
      }
    } catch (error) {
      this.stats.jobsFailed++;
      console.error(`[${this.config.name}] Execution error:`, error);
      this.emit('executionFailed', intent, String(error));
    }
  }

  /**
   * Submit execution result
   */
  private async submitResult(intent: Intent, data: any, executionTime: number): Promise<void> {
    const response = await fetch(`${this.config.apiUrl}/api/intents/${intent.id}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data,
        providerId: this.walletAddress,
        executionTime,
        proof: `proof_${generateId(16)}`
      })
    });

    const result = await response.json();

    if (result.success) {
      // Simulate payment settlement
      await this.simulatePayment(intent.id);
    } else {
      console.error(`[${this.config.name}] Result submission failed:`, result.error);
    }
  }

  /**
   * Simulate payment (for demo)
   */
  private async simulatePayment(intentId: string): Promise<void> {
    try {
      await fetch(`${this.config.apiUrl}/api/payments/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intentId,
          providerAddress: this.walletAddress
        })
      });
    } catch (error) {
      console.error(`[${this.config.name}] Payment simulation failed:`, error);
    }
  }

  /**
   * Create default handler that returns mock data
   */
  private createDefaultHandler(): IntentHandler {
    return async (intent, params) => {
      // Simulate processing
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

      return {
        success: true,
        data: {
          intentType: intent.type,
          params,
          timestamp: Date.now(),
          provider: this.config.name
        }
      };
    };
  }

  // -------------------- Public API --------------------

  /**
   * Register handler for specific intent type
   */
  onIntent<T = unknown>(intentType: string, handler: IntentHandler<T>): void {
    this.intentHandlers.set(intentType, handler as IntentHandler);
  }

  /**
   * Set default handler for unmatched intents
   */
  setDefaultHandler<T = unknown>(handler: IntentHandler<T>): void {
    this.defaultHandler = handler as IntentHandler;
  }

  /**
   * Set bid strategy
   */
  setBidStrategy(strategy: Partial<BidStrategy>): void {
    this.bidStrategy = { ...this.bidStrategy, ...strategy };
  }

  /**
   * Set reputation score (for demo)
   */
  setReputationScore(score: number): void {
    this.reputationScore = Math.max(0, Math.min(5, score));
  }

  /**
   * Get provider statistics
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * Get wallet address
   */
  getWalletAddress(): string {
    return this.walletAddress;
  }

  /**
   * Get provider ID
   */
  getProviderId(): string | null {
    return this.providerId;
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Check if registered
   */
  get registered(): boolean {
    return this.isRegistered;
  }

  /**
   * Stop the provider
   */
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.isRegistered = false;
  }
}

/**
 * Create a new Synapse provider
 */
export function createProvider(config: ProviderConfig): SynapseProvider {
  return new SynapseProvider(config);
}
