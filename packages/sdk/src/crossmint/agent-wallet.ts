// ============================================================
// SYNAPSE Agent Wallet
// High-level wallet abstraction for AI agents with x402 support
// ============================================================

import { EventEmitter } from 'events';
import { CrossmintClient, getCrossmintClient } from './crossmint-client.js';
import {
  CrossmintChain,
  WalletInfo,
  TokenBalance,
  TransactionResult,
  TypedDataParams,
  SignatureResult,
} from './crossmint-types.js';

/**
 * Agent wallet configuration
 */
export interface AgentWalletConfig {
  /** Unique agent identifier */
  agentId: string;
  /** Crossmint client (optional - uses default if not provided) */
  crossmintClient?: CrossmintClient;
  /** Default chain */
  chain?: CrossmintChain;
  /** Auto-create wallet if doesn't exist */
  autoCreate?: boolean;
}

/**
 * x402 payment parameters
 */
export interface X402PaymentParams {
  /** Recipient address */
  recipient: string;
  /** Amount in token units (e.g., "0.01") */
  amount: string;
  /** Token address (defaults to USDC) */
  tokenAddress?: string;
  /** Network */
  network?: CrossmintChain;
}

/**
 * x402 payment result
 */
export interface X402PaymentResult {
  /** Transaction hash */
  txHash: string;
  /** Signature for x402 header */
  signature: string;
  /** Network used */
  network: CrossmintChain;
  /** Amount paid */
  amount: string;
  /** Token used */
  token: string;
  /** Encoded x402 payment header */
  x402Header: string;
}

interface AgentWalletEvents {
  'initialized': (wallet: WalletInfo) => void;
  'payment:sent': (result: X402PaymentResult) => void;
  'balance:low': (balance: TokenBalance) => void;
  'error': (error: Error) => void;
}

/**
 * USDC addresses by network
 */
const USDC_ADDRESSES: Record<CrossmintChain, string> = {
  'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  'ethereum': '0xA0b86a33E6176cE9E3e61B3bAa7c11fA06B1c5c6',
  'ethereum-sepolia': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  'polygon': '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  'polygon-amoy': '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
  'arbitrum': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  'arbitrum-sepolia': '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  'optimism': '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  'optimism-sepolia': '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
  'solana': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'solana-devnet': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
};

/**
 * Agent Wallet
 *
 * High-level wallet abstraction designed for AI agents. Provides simplified
 * APIs for common operations like x402 payments, balance checking, and signing.
 *
 * Features:
 * - Automatic wallet creation
 * - x402 payment support
 * - EIP-712 signing for payment authorization
 * - Balance monitoring with low balance alerts
 *
 * Usage:
 * ```typescript
 * const wallet = new AgentWallet({ agentId: 'my-agent' });
 * await wallet.initialize();
 *
 * // Make an x402 payment
 * const payment = await wallet.makeX402Payment({
 *   recipient: '0xProvider...',
 *   amount: '0.01',
 * });
 *
 * // Use payment header in HTTP request
 * fetch(url, {
 *   headers: { 'X-Payment': payment.x402Header }
 * });
 * ```
 */
export class AgentWallet extends EventEmitter {
  private config: AgentWalletConfig;
  private client: CrossmintClient;
  private wallet: WalletInfo | null = null;
  private initialized: boolean = false;
  private lowBalanceThreshold: bigint = BigInt(1_000_000); // 1 USDC

  constructor(config: AgentWalletConfig) {
    super();
    this.config = {
      autoCreate: true,
      chain: 'base-sepolia',
      ...config,
    };
    this.client = config.crossmintClient || getCrossmintClient();
  }

  /**
   * Initialize the wallet (create if needed)
   */
  async initialize(): Promise<WalletInfo> {
    if (this.initialized && this.wallet) {
      return this.wallet;
    }

    try {
      if (this.config.autoCreate) {
        this.wallet = await this.client.getOrCreateWallet(
          this.config.agentId,
          this.config.chain
        );
      } else {
        const existing = await this.client.getWallet(this.config.agentId);
        if (!existing) {
          throw new Error(`Wallet not found for agent ${this.config.agentId}`);
        }
        this.wallet = existing;
      }

      this.initialized = true;
      this.emit('initialized', this.wallet);

      // Check balance on init
      await this.checkBalance();

      return this.wallet;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('error', err);
      throw err;
    }
  }

  /**
   * Ensure wallet is initialized
   */
  private async ensureInitialized(): Promise<WalletInfo> {
    if (!this.initialized || !this.wallet) {
      return this.initialize();
    }
    return this.wallet;
  }

  /**
   * Get wallet address
   */
  async getAddress(): Promise<string> {
    const wallet = await this.ensureInitialized();
    return wallet.address;
  }

  /**
   * Get wallet ID
   */
  async getWalletId(): Promise<string> {
    const wallet = await this.ensureInitialized();
    return wallet.id;
  }

  /**
   * Get wallet info
   */
  async getWalletInfo(): Promise<WalletInfo> {
    return this.ensureInitialized();
  }

  /**
   * Get USDC balance
   */
  async getUSDCBalance(): Promise<TokenBalance | null> {
    const wallet = await this.ensureInitialized();
    const usdcAddress = USDC_ADDRESSES[wallet.chain];
    return this.client.getTokenBalance(wallet.id, usdcAddress);
  }

  /**
   * Get all balances
   */
  async getBalances(): Promise<TokenBalance[]> {
    const wallet = await this.ensureInitialized();
    return this.client.getBalances(wallet.id);
  }

  /**
   * Check balance and emit warning if low
   */
  async checkBalance(): Promise<TokenBalance | null> {
    const balance = await this.getUSDCBalance();

    if (balance) {
      const balanceValue = BigInt(balance.balance);
      if (balanceValue < this.lowBalanceThreshold) {
        this.emit('balance:low', balance);
      }
    }

    return balance;
  }

  /**
   * Set low balance threshold
   */
  setLowBalanceThreshold(amountUSDC: string): void {
    // Convert to 6 decimal places (USDC decimals)
    const [whole, decimal = ''] = amountUSDC.split('.');
    const paddedDecimal = decimal.padEnd(6, '0').slice(0, 6);
    this.lowBalanceThreshold = BigInt(whole + paddedDecimal);
  }

  /**
   * Make an x402 payment
   */
  async makeX402Payment(params: X402PaymentParams): Promise<X402PaymentResult> {
    const wallet = await this.ensureInitialized();
    const network = params.network || wallet.chain;
    const tokenAddress = params.tokenAddress || USDC_ADDRESSES[network];

    // Transfer the tokens
    const tx = await this.client.transferToken(wallet.id, {
      to: params.recipient,
      tokenAddress,
      amount: params.amount,
    });

    // Wait for confirmation
    const confirmedTx = await this.client.waitForTransaction(wallet.id, tx.id);

    if (confirmedTx.status !== 'confirmed') {
      throw new Error(`Transaction failed: ${confirmedTx.error || 'Unknown error'}`);
    }

    // Create attestation signature
    const attestation = {
      type: 'x402-payment',
      txHash: confirmedTx.txHash,
      recipient: params.recipient,
      amount: params.amount,
      token: tokenAddress,
      network,
      timestamp: Date.now(),
    };

    const signResult = await this.client.signMessage(wallet.id, {
      message: JSON.stringify(attestation),
    });

    // Create x402 header
    const x402Payload = {
      scheme: 'exact',
      network,
      signature: signResult.signature,
      authorization: {
        from: wallet.address,
        to: params.recipient,
        token: tokenAddress,
        amount: params.amount,
        validAfter: Math.floor(Date.now() / 1000) - 60,
        validBefore: Math.floor(Date.now() / 1000) + 300,
        nonce: confirmedTx.txHash,
      },
    };

    const x402Header = Buffer.from(JSON.stringify(x402Payload)).toString('base64');

    const result: X402PaymentResult = {
      txHash: confirmedTx.txHash!,
      signature: signResult.signature,
      network,
      amount: params.amount,
      token: tokenAddress,
      x402Header,
    };

    this.emit('payment:sent', result);
    return result;
  }

  /**
   * Create x402 payment authorization (without transfer)
   *
   * Creates a signed authorization that can be submitted with an HTTP request.
   * The recipient will settle the payment using this authorization.
   */
  async createX402Authorization(params: X402PaymentParams): Promise<X402PaymentResult> {
    const wallet = await this.ensureInitialized();
    const network = params.network || wallet.chain;
    const tokenAddress = params.tokenAddress || USDC_ADDRESSES[network];

    const now = Math.floor(Date.now() / 1000);
    const nonce = `0x${Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('')}`;

    // Sign EIP-712 authorization (TransferWithAuthorization for USDC)
    const typedData: TypedDataParams = {
      domain: {
        name: 'USD Coin',
        version: '2',
        chainId: this.getChainId(network),
        verifyingContract: tokenAddress,
      },
      types: {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
      primaryType: 'TransferWithAuthorization',
      message: {
        from: wallet.address,
        to: params.recipient,
        value: this.parseAmount(params.amount, 6),
        validAfter: now - 60,
        validBefore: now + 300, // 5 minutes
        nonce,
      },
    };

    const signResult = await this.client.signTypedData(wallet.id, typedData);

    // Create x402 header
    const x402Payload = {
      scheme: 'exact',
      network,
      signature: signResult.signature,
      authorization: {
        from: wallet.address,
        to: params.recipient,
        token: tokenAddress,
        amount: this.parseAmount(params.amount, 6),
        validAfter: now - 60,
        validBefore: now + 300,
        nonce,
      },
    };

    const x402Header = Buffer.from(JSON.stringify(x402Payload)).toString('base64');

    return {
      txHash: '', // No tx yet - will be created by recipient
      signature: signResult.signature,
      network,
      amount: params.amount,
      token: tokenAddress,
      x402Header,
    };
  }

  /**
   * Sign a message
   */
  async signMessage(message: string): Promise<SignatureResult> {
    const wallet = await this.ensureInitialized();
    return this.client.signMessage(wallet.id, { message });
  }

  /**
   * Sign typed data (EIP-712)
   */
  async signTypedData(typedData: TypedDataParams): Promise<SignatureResult> {
    const wallet = await this.ensureInitialized();
    return this.client.signTypedData(wallet.id, typedData);
  }

  /**
   * Get chain ID
   */
  private getChainId(chain: CrossmintChain): number {
    const chainIds: Record<CrossmintChain, number> = {
      'base': 8453,
      'base-sepolia': 84532,
      'ethereum': 1,
      'ethereum-sepolia': 11155111,
      'polygon': 137,
      'polygon-amoy': 80002,
      'arbitrum': 42161,
      'arbitrum-sepolia': 421614,
      'optimism': 10,
      'optimism-sepolia': 11155420,
      'solana': 0,
      'solana-devnet': 0,
    };
    return chainIds[chain];
  }

  /**
   * Parse amount to smallest units
   */
  private parseAmount(amount: string, decimals: number): string {
    const [whole, decimal = ''] = amount.split('.');
    const paddedDecimal = decimal.padEnd(decimals, '0').slice(0, decimals);
    return BigInt(whole + paddedDecimal).toString();
  }

  /**
   * Check if initialized
   */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get agent ID
   */
  get agentId(): string {
    return this.config.agentId;
  }

  /**
   * Get chain
   */
  get chain(): CrossmintChain {
    return this.wallet?.chain || this.config.chain || 'base-sepolia';
  }

  /**
   * Check if in demo mode
   */
  get isDemoMode(): boolean {
    return this.client.isDemoMode;
  }
}

// ============================================================
// FACTORY FUNCTIONS
// ============================================================

/**
 * Create an agent wallet
 */
export function createAgentWallet(config: AgentWalletConfig): AgentWallet {
  return new AgentWallet(config);
}

/**
 * Create and initialize an agent wallet
 */
export async function createAndInitializeAgentWallet(
  config: AgentWalletConfig
): Promise<AgentWallet> {
  const wallet = new AgentWallet(config);
  await wallet.initialize();
  return wallet;
}

// Wallet registry for managing multiple agent wallets
const walletRegistry = new Map<string, AgentWallet>();

/**
 * Get or create an agent wallet
 */
export async function getAgentWallet(agentId: string, chain?: CrossmintChain): Promise<AgentWallet> {
  let wallet = walletRegistry.get(agentId);

  if (!wallet) {
    wallet = new AgentWallet({ agentId, chain });
    await wallet.initialize();
    walletRegistry.set(agentId, wallet);
  }

  return wallet;
}

/**
 * Clear wallet registry
 */
export function clearWalletRegistry(): void {
  walletRegistry.clear();
}
