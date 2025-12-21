// ============================================================
// SYNAPSE Crossmint API Client
// Production-ready Crossmint wallet API integration
// ============================================================

import { EventEmitter } from 'events';
import {
  CrossmintConfig,
  CrossmintChain,
  WalletInfo,
  WalletType,
  CreateWalletParams,
  TokenBalance,
  TransactionParams,
  TokenTransferParams,
  TransactionResult,
  SignMessageParams,
  TypedDataParams,
  SignatureResult,
  CrossmintResponse,
  TransactionHistory,
  PaginationParams,
  CrossmintPaginatedResponse,
  CROSSMINT_CHAIN_IDS,
} from './crossmint-types.js';

/**
 * Crossmint API endpoints
 */
const API_URLS = {
  staging: 'https://staging.crossmint.com/api',
  production: 'https://www.crossmint.com/api',
};

/**
 * API version
 */
const API_VERSION = 'v1-alpha2';

interface CrossmintClientEvents {
  'wallet:created': (wallet: WalletInfo) => void;
  'transaction:submitted': (tx: TransactionResult) => void;
  'transaction:confirmed': (tx: TransactionResult) => void;
  'transaction:failed': (tx: TransactionResult) => void;
  'error': (error: Error) => void;
}

/**
 * Crossmint API Client
 *
 * Full integration with Crossmint's wallet infrastructure for AI agents.
 * Supports wallet creation, token transfers, message signing, and more.
 *
 * Usage:
 * ```typescript
 * const client = new CrossmintClient({
 *   apiKey: process.env.CROSSMINT_API_KEY,
 *   environment: 'staging',
 *   defaultChain: 'base-sepolia',
 * });
 *
 * // Create a wallet for an agent
 * const wallet = await client.createWallet({ linkedUser: 'agent-123' });
 *
 * // Transfer tokens
 * const tx = await client.transferToken(wallet.id, {
 *   to: '0xRecipient...',
 *   tokenAddress: '0xUSDC...',
 *   amount: '0.01',
 * });
 * ```
 */
export class CrossmintClient extends EventEmitter {
  private config: CrossmintConfig;
  private baseUrl: string;
  private walletCache: Map<string, WalletInfo> = new Map();
  private demoMode: boolean;

  constructor(config: CrossmintConfig) {
    super();
    this.config = {
      environment: 'staging',
      defaultChain: 'base-sepolia',
      ...config,
    };
    this.baseUrl = `${API_URLS[this.config.environment as keyof typeof API_URLS]}/${API_VERSION}`;
    this.demoMode = !config.apiKey || config.apiKey === 'demo';

    if (this.demoMode) {
      console.log('[Crossmint] Running in demo mode - API calls will be simulated');
    }
  }

  // ============================================================
  // WALLET MANAGEMENT
  // ============================================================

  /**
   * Create a new wallet
   */
  async createWallet(params: CreateWalletParams): Promise<WalletInfo> {
    if (this.demoMode) {
      return this.createDemoWallet(params);
    }

    const chain = params.chain || this.config.defaultChain || 'base-sepolia';
    const type: WalletType = chain.startsWith('solana') ? 'solana-custodial-wallet' : 'evm-smart-wallet';

    const response = await this.request<WalletInfo>('/wallets', {
      method: 'POST',
      body: {
        type,
        linkedUser: params.linkedUser,
        config: {
          chain: CROSSMINT_CHAIN_IDS[chain],
        },
      },
      headers: params.idempotencyKey
        ? { 'X-Idempotency-Key': params.idempotencyKey }
        : undefined,
    });

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to create wallet');
    }

    const wallet: WalletInfo = {
      id: response.data.id,
      address: response.data.address,
      chain,
      type,
      linkedUser: params.linkedUser,
      createdAt: response.data.createdAt || new Date().toISOString(),
    };

    this.walletCache.set(wallet.id, wallet);
    this.walletCache.set(params.linkedUser, wallet);
    this.emit('wallet:created', wallet);

    return wallet;
  }

  /**
   * Get wallet by ID or linked user
   */
  async getWallet(idOrLinkedUser: string): Promise<WalletInfo | null> {
    // Check cache first
    const cached = this.walletCache.get(idOrLinkedUser);
    if (cached) return cached;

    if (this.demoMode) {
      return null;
    }

    try {
      // Try by ID first
      const response = await this.request<WalletInfo>(`/wallets/${idOrLinkedUser}`);

      if (response.success && response.data) {
        const wallet = response.data;
        this.walletCache.set(wallet.id, wallet);
        return wallet;
      }
    } catch {
      // Try by linked user
      const response = await this.request<{ items: WalletInfo[] }>('/wallets', {
        params: { linkedUser: idOrLinkedUser },
      });

      if (response.success && response.data?.items?.length) {
        const wallet = response.data.items[0];
        this.walletCache.set(wallet.id, wallet);
        this.walletCache.set(idOrLinkedUser, wallet);
        return wallet;
      }
    }

    return null;
  }

  /**
   * Get or create wallet for a user/agent
   */
  async getOrCreateWallet(linkedUser: string, chain?: CrossmintChain): Promise<WalletInfo> {
    const existing = await this.getWallet(linkedUser);
    if (existing) return existing;

    return this.createWallet({ linkedUser, chain });
  }

  /**
   * List all wallets
   */
  async listWallets(pagination?: PaginationParams): Promise<CrossmintPaginatedResponse<WalletInfo>> {
    if (this.demoMode) {
      return {
        items: Array.from(this.walletCache.values()),
        totalCount: this.walletCache.size,
        page: 1,
        perPage: 20,
        totalPages: 1,
      };
    }

    const response = await this.request<CrossmintPaginatedResponse<WalletInfo>>('/wallets', {
      params: pagination as Record<string, unknown>,
    });

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to list wallets');
    }

    return response.data;
  }

  // ============================================================
  // BALANCE & TRANSFERS
  // ============================================================

  /**
   * Get wallet balances
   */
  async getBalances(walletId: string): Promise<TokenBalance[]> {
    if (this.demoMode) {
      return this.getDemoBalances();
    }

    const response = await this.request<TokenBalance[]>(`/wallets/${walletId}/balances`);

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to get balances');
    }

    return response.data;
  }

  /**
   * Get specific token balance
   */
  async getTokenBalance(walletId: string, tokenAddress: string): Promise<TokenBalance | null> {
    const balances = await this.getBalances(walletId);
    return balances.find(b => b.token.toLowerCase() === tokenAddress.toLowerCase()) || null;
  }

  /**
   * Transfer native token
   */
  async transfer(
    walletId: string,
    params: TransactionParams
  ): Promise<TransactionResult> {
    if (this.demoMode) {
      return this.simulateTransaction(walletId, 'transfer');
    }

    const response = await this.request<TransactionResult>(
      `/wallets/${walletId}/transactions`,
      {
        method: 'POST',
        body: {
          type: 'transfer',
          ...params,
        },
      }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to create transaction');
    }

    const tx = response.data;
    this.emit('transaction:submitted', tx);

    return tx;
  }

  /**
   * Transfer ERC20 token
   */
  async transferToken(
    walletId: string,
    params: TokenTransferParams
  ): Promise<TransactionResult> {
    if (this.demoMode) {
      return this.simulateTransaction(walletId, 'token_transfer');
    }

    const response = await this.request<TransactionResult>(
      `/wallets/${walletId}/transactions`,
      {
        method: 'POST',
        body: {
          type: 'erc20_transfer',
          to: params.to,
          token: params.tokenAddress,
          amount: params.amount,
        },
      }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to transfer token');
    }

    const tx = response.data;
    this.emit('transaction:submitted', tx);

    return tx;
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForTransaction(
    walletId: string,
    txId: string,
    timeoutMs: number = 60000
  ): Promise<TransactionResult> {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < timeoutMs) {
      const response = await this.request<TransactionResult>(
        `/wallets/${walletId}/transactions/${txId}`
      );

      if (response.success && response.data) {
        const tx = response.data;

        if (tx.status === 'confirmed') {
          this.emit('transaction:confirmed', tx);
          return tx;
        }

        if (tx.status === 'failed') {
          this.emit('transaction:failed', tx);
          throw new Error(tx.error || 'Transaction failed');
        }
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Transaction confirmation timeout');
  }

  // ============================================================
  // SIGNING
  // ============================================================

  /**
   * Sign a message
   */
  async signMessage(
    walletId: string,
    params: SignMessageParams
  ): Promise<SignatureResult> {
    if (this.demoMode) {
      return this.simulateSignature(walletId, params.message);
    }

    const response = await this.request<SignatureResult>(
      `/wallets/${walletId}/sign`,
      {
        method: 'POST',
        body: {
          message: params.message,
          type: params.type || 'personal_sign',
        },
      }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to sign message');
    }

    return response.data;
  }

  /**
   * Sign typed data (EIP-712)
   */
  async signTypedData(
    walletId: string,
    typedData: TypedDataParams
  ): Promise<SignatureResult> {
    if (this.demoMode) {
      return this.simulateSignature(walletId, JSON.stringify(typedData));
    }

    const response = await this.request<SignatureResult>(
      `/wallets/${walletId}/sign`,
      {
        method: 'POST',
        body: {
          type: 'eth_signTypedData_v4',
          typedData: {
            domain: typedData.domain,
            types: typedData.types,
            primaryType: typedData.primaryType,
            message: typedData.message,
          },
        },
      }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to sign typed data');
    }

    return response.data;
  }

  // ============================================================
  // TRANSACTION HISTORY
  // ============================================================

  /**
   * Get transaction history for a wallet
   */
  async getTransactionHistory(
    walletId: string,
    pagination?: PaginationParams
  ): Promise<CrossmintPaginatedResponse<TransactionHistory>> {
    if (this.demoMode) {
      return {
        items: [],
        totalCount: 0,
        page: 1,
        perPage: 20,
        totalPages: 0,
      };
    }

    const response = await this.request<CrossmintPaginatedResponse<TransactionHistory>>(
      `/wallets/${walletId}/transactions`,
      { params: pagination as Record<string, unknown> }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to get transaction history');
    }

    return response.data;
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  /**
   * Check if running in demo mode
   */
  get isDemoMode(): boolean {
    return this.demoMode;
  }

  /**
   * Get current configuration
   */
  getConfig(): CrossmintConfig {
    return { ...this.config, apiKey: '[REDACTED]' };
  }

  /**
   * Clear wallet cache
   */
  clearCache(): void {
    this.walletCache.clear();
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  /**
   * Make API request
   */
  private async request<T>(
    endpoint: string,
    options?: {
      method?: string;
      body?: unknown;
      params?: Record<string, unknown>;
      headers?: Record<string, string>;
    }
  ): Promise<CrossmintResponse<T>> {
    const url = new URL(`${this.baseUrl}${endpoint}`);

    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      });
    }

    try {
      const response = await fetch(url.toString(), {
        method: options?.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': this.config.apiKey,
          ...options?.headers,
        },
        body: options?.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: error.message || response.statusText,
            details: error,
          },
        };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('error', new Error(errorMessage));
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: errorMessage,
        },
      };
    }
  }

  // ============================================================
  // DEMO MODE SIMULATIONS
  // ============================================================

  private createDemoWallet(params: CreateWalletParams): WalletInfo {
    const chain = params.chain || this.config.defaultChain || 'base-sepolia';
    const address = this.generateDemoAddress(params.linkedUser);

    const wallet: WalletInfo = {
      id: `wallet_demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      address,
      chain,
      type: chain.startsWith('solana') ? 'solana-custodial-wallet' : 'evm-smart-wallet',
      linkedUser: params.linkedUser,
      createdAt: new Date().toISOString(),
    };

    this.walletCache.set(wallet.id, wallet);
    this.walletCache.set(params.linkedUser, wallet);
    this.emit('wallet:created', wallet);

    return wallet;
  }

  private generateDemoAddress(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `0x${Math.abs(hash).toString(16).padStart(40, '0').slice(0, 40)}`;
  }

  private getDemoBalances(): TokenBalance[] {
    return [
      {
        token: 'native',
        symbol: 'ETH',
        balance: '1000000000000000000',
        balanceFormatted: '1.0',
        decimals: 18,
        usdValue: '2000.00',
      },
      {
        token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC on Base Sepolia
        symbol: 'USDC',
        balance: '100000000',
        balanceFormatted: '100.00',
        decimals: 6,
        usdValue: '100.00',
      },
    ];
  }

  private async simulateTransaction(
    walletId: string,
    type: string
  ): Promise<TransactionResult> {
    await new Promise(resolve => setTimeout(resolve, 500));

    const tx: TransactionResult = {
      id: `tx_demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      txHash: `0x${Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('')}`,
      status: 'confirmed',
      chain: this.config.defaultChain || 'base-sepolia',
      blockNumber: Math.floor(Date.now() / 1000),
    };

    this.emit('transaction:submitted', tx);
    this.emit('transaction:confirmed', tx);

    return tx;
  }

  private async simulateSignature(
    walletId: string,
    message: string
  ): Promise<SignatureResult> {
    const wallet = this.walletCache.get(walletId);
    const address = wallet?.address || '0x0000000000000000000000000000000000000000';

    // Create a deterministic signature from the message
    let hash = 0;
    for (let i = 0; i < message.length; i++) {
      hash = ((hash << 5) - hash) + message.charCodeAt(i);
      hash = hash & hash;
    }

    const signature = `0x${Math.abs(hash).toString(16).padStart(64, '0')}${'0'.repeat(66)}`;

    return { signature, signer: address };
  }
}

// ============================================================
// FACTORY FUNCTIONS
// ============================================================

/**
 * Create a Crossmint client
 */
export function createCrossmintClient(config: CrossmintConfig): CrossmintClient {
  return new CrossmintClient(config);
}

/**
 * Create a demo Crossmint client (no API key needed)
 */
export function createDemoCrossmintClient(chain?: CrossmintChain): CrossmintClient {
  return new CrossmintClient({
    apiKey: 'demo',
    environment: 'staging',
    defaultChain: chain || 'base-sepolia',
  });
}

// Singleton instance
let clientInstance: CrossmintClient | null = null;

/**
 * Get or create default Crossmint client
 */
export function getCrossmintClient(config?: CrossmintConfig): CrossmintClient {
  if (!clientInstance) {
    clientInstance = new CrossmintClient(
      config || {
        apiKey: process.env.CROSSMINT_API_KEY || 'demo',
        environment: (process.env.CROSSMINT_ENVIRONMENT as 'staging' | 'production') || 'staging',
        defaultChain: (process.env.CROSSMINT_DEFAULT_CHAIN as CrossmintChain) || 'base-sepolia',
      }
    );
  }
  return clientInstance;
}

/**
 * Reset the singleton client
 */
export function resetCrossmintClient(): void {
  clientInstance = null;
}
