// ============================================================
// SYNAPSE SDK - AI Agent Client
// Complete agent integration with wallets and x402 payments
// ============================================================

import { SynapseClient, SynapseConfig, IntentOptions, IntentEvents } from './index.js';
import { CrossmintWallet, CrossmintConfig, WalletInfo } from './crossmint-wallet.js';
import { X402Client } from './x402-client.js';
import { Intent } from '@synapse/types';

export interface AgentConfig {
  /** Unique identifier for the agent */
  agentId: string;
  /** Agent name for display */
  name?: string;
  /** Synapse API configuration */
  synapse: Omit<SynapseConfig, 'clientAddress'>;
  /** Crossmint configuration (optional - uses demo if not provided) */
  crossmint?: CrossmintConfig;
  /** Initial budget in USDC */
  initialBudget?: number;
}

export interface AgentState {
  agentId: string;
  name: string;
  wallet: WalletInfo | null;
  balance: string;
  totalSpent: number;
  intentsCreated: number;
  intentsCompleted: number;
  isConnected: boolean;
}

/**
 * AI Agent Client
 *
 * A complete client for AI agents to interact with the Synapse network.
 * Integrates wallet management, x402 payments, and intent execution.
 *
 * Usage:
 * ```typescript
 * const agent = new AgentClient({
 *   agentId: 'my-ai-agent',
 *   name: 'WeatherAssistant',
 *   synapse: { apiUrl: 'http://localhost:3001' }
 * });
 *
 * await agent.initialize();
 *
 * // Execute an intent with automatic payment
 * const weather = await agent.request('weather.current', { city: 'Tokyo' }, 0.02);
 *
 * console.log('Weather:', weather.result);
 * console.log('Cost:', weather.cost);
 * ```
 */
export class AgentClient {
  private config: AgentConfig;
  private synapseClient: SynapseClient | null = null;
  private crossmintWallet: CrossmintWallet;
  private x402Client: X402Client;
  private state: AgentState;
  private eventHandlers: Map<string, Function[]> = new Map();

  constructor(config: AgentConfig) {
    this.config = config;

    // Initialize Crossmint wallet
    if (config.crossmint) {
      this.crossmintWallet = new CrossmintWallet(config.crossmint);
    } else {
      // Use demo wallet
      this.crossmintWallet = new CrossmintWallet({ apiKey: 'demo' });
    }

    // Initialize x402 client with demo mode
    this.x402Client = new X402Client({ demoMode: true });

    // Initialize state
    this.state = {
      agentId: config.agentId,
      name: config.name || config.agentId,
      wallet: null,
      balance: '0',
      totalSpent: 0,
      intentsCreated: 0,
      intentsCompleted: 0,
      isConnected: false
    };
  }

  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    console.log(`[Agent ${this.state.name}] Initializing...`);

    // Create wallet
    this.state.wallet = await this.crossmintWallet.createWallet(this.config.agentId);
    console.log(`[Agent ${this.state.name}] Wallet created: ${this.state.wallet.address}`);

    // Get initial balance
    const balance = await this.crossmintWallet.getBalance(
      this.state.wallet.address,
      'USDC'
    );
    this.state.balance = balance.balance;
    console.log(`[Agent ${this.state.name}] Balance: $${this.state.balance} USDC`);

    // Connect to Synapse
    this.synapseClient = new SynapseClient({
      ...this.config.synapse,
      clientAddress: this.state.wallet.address
    });

    await this.synapseClient.connect();
    this.state.isConnected = true;
    console.log(`[Agent ${this.state.name}] Connected to Synapse`);

    this.emit('initialized', this.state);
  }

  /**
   * Execute a request through Synapse with automatic payment
   */
  async request<T = unknown>(
    type: string,
    params: Record<string, unknown>,
    maxBudget: number,
    options?: {
      timeout?: number;
      requireTEE?: boolean;
      minReputation?: number;
    }
  ): Promise<{
    result: T;
    cost: number;
    provider: string;
    executionTime: number;
    txHash?: string;
  }> {
    if (!this.synapseClient || !this.state.isConnected) {
      throw new Error('Agent not initialized');
    }

    console.log(`[Agent ${this.state.name}] Requesting: ${type}`);
    this.state.intentsCreated++;

    const startTime = Date.now();

    try {
      const execution = await this.synapseClient.execute<T>(
        type,
        params,
        maxBudget,
        { timeout: options?.timeout }
      );

      // Simulate x402 payment for the result
      const payment = await this.crossmintWallet.createX402Payment(
        this.config.agentId,
        execution.provider,
        execution.cost.toString(),
        'USDC'
      );

      // Update state
      this.state.totalSpent += execution.cost;
      this.state.intentsCompleted++;
      this.state.balance = (parseFloat(this.state.balance) - execution.cost).toFixed(2);

      console.log(`[Agent ${this.state.name}] Completed in ${execution.executionTime}ms, cost: $${execution.cost}`);

      this.emit('requestCompleted', {
        type,
        result: execution.result,
        cost: execution.cost,
        txHash: payment.txHash
      });

      return {
        result: execution.result,
        cost: execution.cost,
        provider: execution.provider,
        executionTime: execution.executionTime,
        txHash: payment.txHash
      };
    } catch (error) {
      console.error(`[Agent ${this.state.name}] Request failed:`, error);
      this.emit('requestFailed', { type, error });
      throw error;
    }
  }

  /**
   * Create an intent with manual event handling
   */
  async createIntent(
    options: IntentOptions,
    events?: IntentEvents
  ): Promise<Intent> {
    if (!this.synapseClient) {
      throw new Error('Agent not initialized');
    }

    this.state.intentsCreated++;
    return this.synapseClient.createIntent(options, events);
  }

  /**
   * Make a direct x402 API call to a provider
   */
  async directCall<T = unknown>(
    url: string,
    options?: RequestInit
  ): Promise<{ data: T; paid: boolean; txHash?: string }> {
    const response = await this.x402Client.fetchWithPayment(url, options);

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const data = await response.json();

    // Check if payment was made
    const paymentHeader = response.headers.get('X-Payment-Response');
    let paid = false;
    let txHash: string | undefined;

    if (paymentHeader) {
      try {
        const paymentInfo = JSON.parse(
          Buffer.from(paymentHeader, 'base64').toString('utf-8')
        );
        paid = paymentInfo.success;
        txHash = paymentInfo.txHash;

        if (paid && paymentInfo.amount) {
          this.state.totalSpent += paymentInfo.amount;
        }
      } catch {
        // Ignore parse errors
      }
    }

    return { data, paid, txHash };
  }

  /**
   * Convenience methods for common intents
   */

  async getWeather(city: string, maxBudget = 0.02): Promise<{
    temperature: number;
    humidity: number;
    condition: string;
    city: string;
  }> {
    const { result } = await this.request<{
      temperature: number;
      humidity: number;
      condition: string;
      city: string;
    }>('weather.current', { city }, maxBudget);
    return result;
  }

  async getCryptoPrice(symbol: string, maxBudget = 0.01): Promise<{
    symbol: string;
    price: number;
    change24h: number;
    marketCap: string;
  }> {
    const { result } = await this.request<{
      symbol: string;
      price: number;
      change24h: number;
      marketCap: string;
    }>('crypto.price', { symbol }, maxBudget);
    return result;
  }

  async getNews(topic: string, limit = 5, maxBudget = 0.03): Promise<{
    topic: string;
    articles: Array<{
      title: string;
      source: string;
      url: string;
      summary: string;
    }>;
  }> {
    const { result } = await this.request<{
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

  /**
   * Event handling
   */
  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  off(event: string, handler: Function): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  /**
   * Get current agent state
   */
  getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Get agent's wallet address
   */
  getAddress(): string {
    return this.state.wallet?.address || '';
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    if (this.synapseClient) {
      this.synapseClient.disconnect();
    }
    this.state.isConnected = false;
    this.emit('disconnected', this.state);
  }
}

/**
 * Create an AI agent client
 */
export function createAgentClient(config: AgentConfig): AgentClient {
  return new AgentClient(config);
}
