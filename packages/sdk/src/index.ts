// ============================================================
// SYNAPSE SDK - Client Library
// Easy integration for creating intents and receiving results
// ============================================================

import { io, Socket } from 'socket.io-client';
import {
  Intent,
  Bid,
  CreateIntentRequest,
  IntentCategory,
  IntentStatus,
  WSEventType,
  ApiResponse,
  Provider
} from '@synapse/types';

export interface SynapseConfig {
  apiUrl: string;
  wsUrl?: string;
  clientAddress?: string;
  autoConnect?: boolean;
}

export interface IntentOptions {
  type: string;
  category?: IntentCategory;
  params: Record<string, unknown>;
  maxBudget: number;
  biddingDuration?: number;
  executionTimeout?: number;
  requirements?: {
    minReputation?: number;
    requireTEE?: boolean;
  };
}

export interface IntentEvents {
  onBidReceived?: (bid: Bid, allBids: Bid[]) => void;
  onWinnerSelected?: (winner: Bid, intent: Intent) => void;
  onCompleted?: (intent: Intent, result: unknown) => void;
  onFailed?: (intent: Intent, reason: string) => void;
  onPaymentSettled?: (intent: Intent, amount: number, txHash: string) => void;
}

export class SynapseClient {
  private config: SynapseConfig;
  private socket: Socket | null = null;
  private isConnected = false;
  private intentCallbacks: Map<string, IntentEvents> = new Map();

  constructor(config: SynapseConfig) {
    this.config = {
      wsUrl: config.apiUrl,
      clientAddress: '0xDefaultClient',
      autoConnect: true,
      ...config
    };

    if (this.config.autoConnect) {
      this.connect();
    }
  }

  // -------------------- CONNECTION --------------------

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(this.config.wsUrl || this.config.apiUrl, {
        transports: ['websocket', 'polling']
      });

      this.socket.on('connect', () => {
        console.log('[Synapse SDK] Connected');
        this.isConnected = true;
        this.setupEventListeners();
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('[Synapse SDK] Connection error:', error);
        reject(error);
      });

      this.socket.on('disconnect', () => {
        console.log('[Synapse SDK] Disconnected');
        this.isConnected = false;
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on(WSEventType.BID_RECEIVED, (message: any) => {
      const { intentId } = message.payload?.intent || {};
      const callbacks = this.intentCallbacks.get(intentId);
      if (callbacks?.onBidReceived) {
        callbacks.onBidReceived(message.payload.bid, message.payload.allBids || []);
      }
    });

    this.socket.on(WSEventType.WINNER_SELECTED, (message: any) => {
      const intentId = message.payload?.intent?.id;
      const callbacks = this.intentCallbacks.get(intentId);
      if (callbacks?.onWinnerSelected) {
        callbacks.onWinnerSelected(message.payload.winner, message.payload.intent);
      }
    });

    this.socket.on(WSEventType.INTENT_COMPLETED, (message: any) => {
      const intentId = message.payload?.intent?.id;
      const callbacks = this.intentCallbacks.get(intentId);
      if (callbacks?.onCompleted) {
        callbacks.onCompleted(message.payload.intent, message.payload.result);
      }
    });

    this.socket.on(WSEventType.INTENT_FAILED, (message: any) => {
      const intentId = message.payload?.intent?.id;
      const callbacks = this.intentCallbacks.get(intentId);
      if (callbacks?.onFailed) {
        callbacks.onFailed(message.payload.intent, message.payload.reason);
      }
    });

    this.socket.on(WSEventType.PAYMENT_SETTLED, (message: any) => {
      const intentId = message.payload?.intent?.id;
      const callbacks = this.intentCallbacks.get(intentId);
      if (callbacks?.onPaymentSettled) {
        callbacks.onPaymentSettled(
          message.payload.intent,
          message.payload.amount,
          message.payload.transactionHash
        );
      }
    });
  }

  // -------------------- INTENTS --------------------

  async createIntent(options: IntentOptions, events?: IntentEvents): Promise<Intent> {
    const category = options.category || this.inferCategory(options.type);

    const request: CreateIntentRequest = {
      type: options.type,
      category,
      params: options.params,
      maxBudget: options.maxBudget,
      biddingDuration: options.biddingDuration || 5000,
      executionTimeout: options.executionTimeout || 30000,
      requirements: options.requirements
    };

    const response = await this.post<Intent>('/api/intents', request);

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to create intent');
    }

    const intent = response.data;

    // Register callbacks
    if (events) {
      this.intentCallbacks.set(intent.id, events);
    }

    // Subscribe to intent updates via WebSocket
    if (this.socket && this.isConnected) {
      this.socket.emit(WSEventType.SUBSCRIBE_INTENT, { intentId: intent.id });
    }

    return intent;
  }

  private inferCategory(type: string): IntentCategory {
    const prefix = type.split('.')[0];
    const categoryMap: Record<string, IntentCategory> = {
      weather: IntentCategory.DATA,
      crypto: IntentCategory.DATA,
      news: IntentCategory.DATA,
      ai: IntentCategory.AI,
      compute: IntentCategory.COMPUTE,
      search: IntentCategory.SEARCH
    };
    return categoryMap[prefix] || IntentCategory.DATA;
  }

  async getIntent(intentId: string): Promise<{ intent: Intent; bids: Bid[] }> {
    const response = await this.get<{ intent: Intent; bids: Bid[] }>(`/api/intents/${intentId}`);
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to get intent');
    }
    return response.data;
  }

  async cancelIntent(intentId: string): Promise<boolean> {
    const response = await this.post<{ cancelled: boolean }>(`/api/intents/${intentId}/cancel`, {
      clientAddress: this.config.clientAddress
    });
    return response.success && response.data?.cancelled || false;
  }

  // -------------------- PROVIDERS --------------------

  async getProviders(): Promise<Provider[]> {
    const response = await this.get<Provider[]>('/api/providers');
    return response.data || [];
  }

  async discoverProviders(intentType: string): Promise<Provider[]> {
    const response = await this.get<Provider[]>(`/api/providers/discover/${intentType}`);
    return response.data || [];
  }

  // -------------------- HIGH-LEVEL HELPERS --------------------

  /**
   * Execute an intent and wait for result
   * This is the simplest way to use Synapse
   */
  async execute<T = unknown>(
    type: string,
    params: Record<string, unknown>,
    maxBudget: number,
    options?: {
      timeout?: number;
      biddingDuration?: number;
    }
  ): Promise<{
    result: T;
    cost: number;
    executionTime: number;
    provider: string;
  }> {
    return new Promise(async (resolve, reject) => {
      const timeout = options?.timeout || 60000;
      const timer = setTimeout(() => {
        reject(new Error('Intent execution timed out'));
      }, timeout);

      try {
        const intent = await this.createIntent(
          {
            type,
            params,
            maxBudget,
            biddingDuration: options?.biddingDuration || 5000
          },
          {
            onCompleted: (completedIntent) => {
              clearTimeout(timer);
              if (completedIntent.result) {
                resolve({
                  result: completedIntent.result.data as T,
                  cost: completedIntent.result.settledAmount,
                  executionTime: completedIntent.result.executionTime,
                  provider: completedIntent.result.providerId
                });
              } else {
                reject(new Error('Intent completed but no result'));
              }
            },
            onFailed: (failedIntent, reason) => {
              clearTimeout(timer);
              reject(new Error(`Intent failed: ${reason}`));
            }
          }
        );
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  // -------------------- CONVENIENCE METHODS --------------------

  /**
   * Get weather for a city
   */
  async getWeather(city: string, maxBudget = 0.02): Promise<{
    temperature: number;
    humidity: number;
    condition: string;
    city: string;
  }> {
    const { result } = await this.execute<{
      temperature: number;
      humidity: number;
      condition: string;
      city: string;
    }>('weather.current', { city }, maxBudget);
    return result;
  }

  /**
   * Get crypto price
   */
  async getCryptoPrice(symbol: string, maxBudget = 0.01): Promise<{
    symbol: string;
    price: number;
    change24h: number;
    marketCap: string;
  }> {
    const { result } = await this.execute<{
      symbol: string;
      price: number;
      change24h: number;
      marketCap: string;
    }>('crypto.price', { symbol }, maxBudget);
    return result;
  }

  /**
   * Get latest news
   */
  async getNews(topic: string, limit = 5, maxBudget = 0.03): Promise<{
    topic: string;
    articles: Array<{
      title: string;
      source: string;
      url: string;
      summary: string;
    }>;
  }> {
    const { result } = await this.execute<{
      topic: string;
      articles: Array<{
        title: string;
        source: string;
        url: string;
        summary: string;
      }>;
    }>('news.latest', { topic, limit }, maxBudget);
    return result;
  }

  // -------------------- HTTP HELPERS --------------------

  private async get<T>(path: string): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.config.apiUrl}${path}`);
    return response.json();
  }

  private async post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.config.apiUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Address': this.config.clientAddress || ''
      },
      body: JSON.stringify(body)
    });
    return response.json();
  }

  // -------------------- GETTERS --------------------

  get connected(): boolean {
    return this.isConnected;
  }
}

// Factory function
export function createSynapseClient(config: SynapseConfig): SynapseClient {
  return new SynapseClient(config);
}

// Re-export types
export * from '@synapse/types';

// x402 Payment Client
export { X402Client, createX402Client, type X402ClientConfig, type X402PaymentRequest, type X402PaymentProof } from './x402-client.js';

// Crossmint Wallet Integration (Legacy)
export {
  CrossmintWallet,
  createCrossmintWallet,
  createDemoCrossmintWallet,
  type CrossmintConfig,
  type WalletInfo,
  type TransactionRequest,
  type TransactionResult
} from './crossmint-wallet.js';

// Crossmint Integration (New - Full SDK integration)
export * from './crossmint/index.js';

// AI Agent Client
export {
  AgentClient,
  createAgentClient,
  type AgentConfig,
  type AgentState
} from './agent-client.js';

// Provider SDK
export {
  SynapseProvider,
  createProvider,
  type ProviderConfig,
  type BidStrategy,
  type ExecutionResult,
  type ProviderEvents
} from './provider-sdk.js';
