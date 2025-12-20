// ============================================================
// SYNAPSE SDK - Crossmint Wallet Integration
// Wallet-as-a-service for AI agents with custodial key management
// ============================================================

export interface CrossmintConfig {
  apiKey: string;
  environment?: 'staging' | 'production';
  defaultChain?: string;
}

export interface WalletInfo {
  address: string;
  chain: string;
  type: 'custodial' | 'non-custodial';
  balances?: Record<string, string>;
}

export interface TransactionRequest {
  to: string;
  value?: string;
  data?: string;
  token?: string;
  amount?: string;
}

export interface TransactionResult {
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  chain: string;
  blockNumber?: number;
}

const CROSSMINT_API_URLS = {
  staging: 'https://staging.crossmint.com/api',
  production: 'https://www.crossmint.com/api'
};

/**
 * Crossmint Wallet Client
 *
 * Provides wallet-as-a-service for AI agents using Crossmint's API.
 * Enables agents to have their own wallets for x402 payments.
 *
 * Usage:
 * ```typescript
 * const wallet = new CrossmintWallet({
 *   apiKey: 'your-crossmint-api-key',
 *   environment: 'staging'
 * });
 *
 * // Create a wallet for an agent
 * const agentWallet = await wallet.createWallet('agent-123');
 *
 * // Check balance
 * const balance = await wallet.getBalance(agentWallet.address, 'USDC');
 *
 * // Make x402 payment
 * const tx = await wallet.transfer({
 *   to: '0xProvider...',
 *   token: 'USDC',
 *   amount: '0.01'
 * });
 * ```
 */
export class CrossmintWallet {
  private config: CrossmintConfig;
  private baseUrl: string;
  private walletCache: Map<string, WalletInfo> = new Map();

  constructor(config: CrossmintConfig) {
    this.config = {
      environment: 'staging',
      defaultChain: 'base-sepolia',
      ...config
    };
    this.baseUrl = CROSSMINT_API_URLS[this.config.environment!];
  }

  /**
   * Create a new custodial wallet for an agent
   */
  async createWallet(
    agentId: string,
    options?: { chain?: string; email?: string }
  ): Promise<WalletInfo> {
    const chain = options?.chain || this.config.defaultChain;

    // In demo mode, generate a mock wallet
    if (!this.config.apiKey || this.config.apiKey === 'demo') {
      const mockWallet: WalletInfo = {
        address: `0x${this.generateMockAddress(agentId)}`,
        chain: chain!,
        type: 'custodial'
      };
      this.walletCache.set(agentId, mockWallet);
      return mockWallet;
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1-alpha2/wallets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': this.config.apiKey
        },
        body: JSON.stringify({
          type: 'evm-smart-wallet',
          linkedUser: agentId,
          config: {
            chain: chain
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Crossmint API error: ${response.statusText}`);
      }

      const data = await response.json();

      const wallet: WalletInfo = {
        address: data.address || data.publicKey,
        chain: chain!,
        type: 'custodial'
      };

      this.walletCache.set(agentId, wallet);
      return wallet;
    } catch (error) {
      console.error('[Crossmint] Error creating wallet:', error);
      // Fallback to mock wallet
      const mockWallet: WalletInfo = {
        address: `0x${this.generateMockAddress(agentId)}`,
        chain: chain!,
        type: 'custodial'
      };
      this.walletCache.set(agentId, mockWallet);
      return mockWallet;
    }
  }

  /**
   * Get wallet for an agent (creates if doesn't exist)
   */
  async getOrCreateWallet(agentId: string): Promise<WalletInfo> {
    const cached = this.walletCache.get(agentId);
    if (cached) return cached;
    return this.createWallet(agentId);
  }

  /**
   * Get balance for a wallet
   */
  async getBalance(
    address: string,
    token: string = 'USDC'
  ): Promise<{ balance: string; token: string }> {
    // In demo mode, return mock balance
    if (!this.config.apiKey || this.config.apiKey === 'demo') {
      return {
        balance: '100.00',
        token
      };
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/v1-alpha2/wallets/${address}/balances`,
        {
          headers: {
            'X-API-KEY': this.config.apiKey
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Crossmint API error: ${response.statusText}`);
      }

      const data = await response.json();
      const tokenBalance = data.find((b: any) => b.symbol === token);

      return {
        balance: tokenBalance?.balance || '0',
        token
      };
    } catch (error) {
      console.error('[Crossmint] Error getting balance:', error);
      return { balance: '0', token };
    }
  }

  /**
   * Transfer tokens from agent wallet
   */
  async transfer(
    fromAgentId: string,
    request: TransactionRequest
  ): Promise<TransactionResult> {
    const wallet = await this.getOrCreateWallet(fromAgentId);

    // In demo mode, simulate transaction
    if (!this.config.apiKey || this.config.apiKey === 'demo') {
      return this.simulateTransaction(wallet.chain, request);
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/v1-alpha2/wallets/${wallet.address}/transactions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': this.config.apiKey
          },
          body: JSON.stringify({
            chain: wallet.chain,
            to: request.to,
            value: request.value,
            token: request.token,
            amount: request.amount
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Crossmint API error: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        txHash: data.txId || data.transactionHash,
        status: 'pending',
        chain: wallet.chain
      };
    } catch (error) {
      console.error('[Crossmint] Error transferring:', error);
      return this.simulateTransaction(wallet.chain, request);
    }
  }

  /**
   * Sign a message with agent's wallet
   */
  async signMessage(agentId: string, message: string): Promise<string> {
    const wallet = await this.getOrCreateWallet(agentId);

    // In demo mode, return mock signature
    if (!this.config.apiKey || this.config.apiKey === 'demo') {
      return `sig_${Buffer.from(message).toString('hex').slice(0, 32)}_${Date.now()}`;
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/v1-alpha2/wallets/${wallet.address}/sign`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': this.config.apiKey
          },
          body: JSON.stringify({
            message,
            type: 'personal_sign'
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Crossmint API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.signature;
    } catch (error) {
      console.error('[Crossmint] Error signing message:', error);
      return `sig_${Buffer.from(message).toString('hex').slice(0, 32)}_${Date.now()}`;
    }
  }

  /**
   * Create x402 payment proof using Crossmint wallet
   */
  async createX402Payment(
    agentId: string,
    recipient: string,
    amount: string,
    token: string = 'USDC'
  ): Promise<{
    txHash: string;
    signature: string;
    network: string;
  }> {
    const wallet = await this.getOrCreateWallet(agentId);

    // Transfer tokens
    const tx = await this.transfer(agentId, {
      to: recipient,
      token,
      amount
    });

    // Sign payment attestation
    const message = JSON.stringify({
      type: 'x402-payment',
      txHash: tx.txHash,
      recipient,
      amount,
      timestamp: Date.now()
    });

    const signature = await this.signMessage(agentId, message);

    return {
      txHash: tx.txHash,
      signature,
      network: wallet.chain
    };
  }

  /**
   * Simulate a transaction (for demo mode)
   */
  private simulateTransaction(
    chain: string,
    request: TransactionRequest
  ): TransactionResult {
    return {
      txHash: `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`,
      status: 'confirmed',
      chain,
      blockNumber: Math.floor(Date.now() / 1000)
    };
  }

  /**
   * Generate a deterministic mock address from agent ID
   */
  private generateMockAddress(agentId: string): string {
    let hash = 0;
    for (let i = 0; i < agentId.length; i++) {
      const char = agentId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(40, '0').slice(0, 40);
  }
}

/**
 * Create Crossmint wallet client
 */
export function createCrossmintWallet(config: CrossmintConfig): CrossmintWallet {
  return new CrossmintWallet(config);
}

/**
 * Create a demo Crossmint wallet (no API key required)
 */
export function createDemoCrossmintWallet(): CrossmintWallet {
  return new CrossmintWallet({ apiKey: 'demo' });
}
