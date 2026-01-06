// ============================================================
// SYNAPSE x402 Payment Client
// Client-side x402 payment handling for AI agents and users
// ============================================================

import { EventEmitter } from 'eventemitter3';
import {
  X402PaymentPayload,
  X402PaymentRequirements,
  X402Network,
  X402Scheme,
  NETWORK_CHAIN_IDS,
  USDC_ADDRESSES,
  encodePaymentPayload,
  decodePaymentRequirements,
  generateNonce,
  parseUSDCAmount,
  formatUSDCAmount,
  X402_HEADERS,
} from './x402-types.js';

/**
 * Wallet interface for signing payments
 */
export interface X402Wallet {
  /** Wallet address */
  address: string;
  /** Chain ID */
  chainId: number;
  /** Sign a typed data message (EIP-712) */
  signTypedData(domain: object, types: object, value: object): Promise<string>;
  /** Get current balance of a token */
  getTokenBalance?(tokenAddress: string): Promise<bigint>;
}

/**
 * x402 Client configuration
 */
export interface X402ClientConfig {
  /** Wallet for signing payments */
  wallet: X402Wallet;
  /** Default network */
  defaultNetwork?: X402Network;
  /** Auto-pay threshold (pay automatically if under this amount) */
  autoPayThreshold?: string;
  /** Demo mode */
  demoMode?: boolean;
}

/**
 * Payment history entry
 */
export interface PaymentHistoryEntry {
  id: string;
  timestamp: number;
  url: string;
  amount: string;
  tokenSymbol: string;
  network: X402Network;
  recipient: string;
  txHash?: string;
  status: 'pending' | 'completed' | 'failed';
}

interface X402ClientEvents {
  'payment:required': (requirements: X402PaymentRequirements, url: string) => void;
  'payment:created': (payload: X402PaymentPayload) => void;
  'payment:completed': (entry: PaymentHistoryEntry) => void;
  'payment:failed': (error: string, url: string) => void;
}

/**
 * x402 Payment Client
 *
 * Handles creating and signing x402 payment payloads for HTTP requests.
 * Integrates with wallet providers to sign EIP-712 authorization messages.
 *
 * Usage:
 * ```typescript
 * const client = new X402Client({
 *   wallet: myWallet,
 *   defaultNetwork: 'base-sepolia',
 * });
 *
 * // Make a paid request
 * const response = await client.fetchWithPayment('https://api.example.com/data');
 * ```
 */
export class X402Client extends EventEmitter<X402ClientEvents> {
  private config: X402ClientConfig;
  private history: PaymentHistoryEntry[] = [];

  constructor(config: X402ClientConfig) {
    super();
    this.config = {
      autoPayThreshold: '1.00',
      demoMode: false,
      ...config,
    };
  }

  /**
   * Fetch with automatic x402 payment handling
   */
  async fetchWithPayment(
    url: string,
    options?: RequestInit
  ): Promise<Response> {
    // First try without payment
    const initialResponse = await fetch(url, options);

    // If not 402, return as-is
    if (initialResponse.status !== 402) {
      return initialResponse;
    }

    // Parse payment requirements
    const requirementsHeader = initialResponse.headers.get(X402_HEADERS.PAYMENT_REQUIRED);
    if (!requirementsHeader) {
      throw new Error('402 response missing payment requirements header');
    }

    const requirements = decodePaymentRequirements(requirementsHeader);
    if (!requirements) {
      throw new Error('Failed to parse payment requirements');
    }

    this.emit('payment:required', requirements, url);

    // Check auto-pay threshold
    const autoPayLimit = parseUSDCAmount(this.config.autoPayThreshold || '1.00');
    const requiredAmount = parseUSDCAmount(requirements.amount);

    if (requiredAmount > autoPayLimit) {
      throw new Error(
        `Payment of ${requirements.amount} ${requirements.tokenSymbol} exceeds auto-pay threshold`
      );
    }

    // Create and sign payment
    const payload = await this.createPayment(requirements);
    const payloadHeader = encodePaymentPayload(payload);

    // Retry with payment
    const paidResponse = await fetch(url, {
      ...options,
      headers: {
        ...options?.headers,
        [X402_HEADERS.PAYMENT]: payloadHeader,
      },
    });

    // Record payment
    const historyEntry: PaymentHistoryEntry = {
      id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      url,
      amount: requirements.amount,
      tokenSymbol: requirements.tokenSymbol,
      network: requirements.network,
      recipient: requirements.recipient,
      status: paidResponse.ok ? 'completed' : 'failed',
    };

    // Check for tx hash in response
    const responseHeader = paidResponse.headers.get(X402_HEADERS.PAYMENT_RESPONSE);
    if (responseHeader) {
      try {
        const responseData = JSON.parse(Buffer.from(responseHeader, 'base64').toString());
        historyEntry.txHash = responseData.txHash;
      } catch {
        // Ignore parse errors
      }
    }

    this.history.push(historyEntry);
    this.emit('payment:completed', historyEntry);

    return paidResponse;
  }

  /**
   * Create a payment payload for given requirements
   */
  async createPayment(requirements: X402PaymentRequirements): Promise<X402PaymentPayload> {
    if (this.config.demoMode) {
      return this.createDemoPayment(requirements);
    }

    const wallet = this.config.wallet;
    const now = Math.floor(Date.now() / 1000);

    // Build EIP-712 authorization
    const authorization = {
      from: wallet.address,
      to: requirements.recipient,
      token: requirements.tokenAddress,
      amount: requirements.amount,
      validAfter: now - 60, // Valid from 1 minute ago
      validBefore: Math.floor(requirements.expiresAt / 1000),
      nonce: requirements.nonce || generateNonce(),
    };

    // Determine signature type based on token
    // USDC uses ERC-3009 (transferWithAuthorization)
    // Other tokens use ERC-2612 (permit)
    const isUSDC = this.isUSDCToken(requirements.tokenAddress, requirements.network);

    let signature: string;
    if (isUSDC) {
      signature = await this.signTransferWithAuthorization(authorization, requirements.network);
    } else {
      signature = await this.signPermit(authorization, requirements.network);
    }

    const payload: X402PaymentPayload = {
      scheme: requirements.scheme,
      network: requirements.network,
      signature,
      authorization,
    };

    this.emit('payment:created', payload);
    return payload;
  }

  /**
   * Sign a transfer with authorization (ERC-3009 for USDC)
   */
  private async signTransferWithAuthorization(
    authorization: X402PaymentPayload['authorization'],
    network: X402Network
  ): Promise<string> {
    const chainId = NETWORK_CHAIN_IDS[network];
    const tokenAddress = USDC_ADDRESSES[network];

    const domain = {
      name: 'USD Coin',
      version: '2',
      chainId,
      verifyingContract: tokenAddress,
    };

    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    };

    const value = {
      from: authorization.from,
      to: authorization.to,
      value: authorization.amount,
      validAfter: authorization.validAfter,
      validBefore: authorization.validBefore,
      nonce: authorization.nonce,
    };

    return this.config.wallet.signTypedData(domain, types, value);
  }

  /**
   * Sign a permit (ERC-2612)
   */
  private async signPermit(
    authorization: X402PaymentPayload['authorization'],
    network: X402Network
  ): Promise<string> {
    const chainId = NETWORK_CHAIN_IDS[network];

    const domain = {
      name: 'Token',
      version: '1',
      chainId,
      verifyingContract: authorization.token,
    };

    const types = {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    };

    const value = {
      owner: authorization.from,
      spender: authorization.to,
      value: authorization.amount,
      nonce: 0, // Would need to fetch from contract
      deadline: authorization.validBefore,
    };

    return this.config.wallet.signTypedData(domain, types, value);
  }

  /**
   * Check if token is USDC
   */
  private isUSDCToken(tokenAddress: string, network: X402Network): boolean {
    const usdcAddress = USDC_ADDRESSES[network];
    return tokenAddress.toLowerCase() === usdcAddress?.toLowerCase();
  }

  /**
   * Create a demo payment (DEMO MODE ONLY)
   * Only called when demoMode=true is explicitly set.
   */
  private createDemoPayment(requirements: X402PaymentRequirements): X402PaymentPayload {
    console.warn(
      '[x402 Client] DEMO MODE: Creating demo payment. ' +
      'This is NOT a real signed transaction and will only work with demo-mode servers.'
    );

    const now = Math.floor(Date.now() / 1000);

    return {
      scheme: requirements.scheme,
      network: requirements.network,
      // Clearly fake signature with demo prefix
      signature: `0xdemo_${Date.now().toString(16)}_${Math.random().toString(36).slice(2, 10)}`,
      authorization: {
        from: this.config.wallet.address,
        to: requirements.recipient,
        token: requirements.tokenAddress,
        amount: requirements.amount,
        validAfter: now - 60,
        validBefore: Math.floor(requirements.expiresAt / 1000),
        nonce: requirements.nonce || generateNonce(),
      },
    };
  }

  /**
   * Get payment history
   */
  getHistory(): PaymentHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Get total spent
   */
  getTotalSpent(): { amount: bigint; formatted: string } {
    const total = this.history
      .filter(h => h.status === 'completed')
      .reduce((sum, h) => sum + parseUSDCAmount(h.amount), BigInt(0));

    return {
      amount: total,
      formatted: formatUSDCAmount(total),
    };
  }

  /**
   * Clear payment history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Check if running in demo mode
   */
  get isDemoMode(): boolean {
    return this.config.demoMode || false;
  }

  /**
   * Get wallet address
   */
  get address(): string {
    return this.config.wallet.address;
  }
}

// ============================================================
// ============================================================
// FACTORY FUNCTIONS
// ============================================================

/**
 * Create an x402 payment client
 */
export function createX402Client(config: X402ClientConfig): X402Client {
  return new X402Client(config);
}

/**
 * Wrap fetch with x402 payment support
 */
export function wrapFetchWithPayment(
  client: X402Client
): (url: string, options?: RequestInit) => Promise<Response> {
  return (url: string, options?: RequestInit) => client.fetchWithPayment(url, options);
}
