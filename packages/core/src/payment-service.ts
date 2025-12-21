// ============================================================
// SYNAPSE Payment Service
// Unified payment orchestration for x402 + Crossmint
// ============================================================

import { EventEmitter } from 'eventemitter3';
import {
  X402Facilitator,
  X402MiddlewareConfig,
  X402PaymentPayload,
  X402PaymentRequirements,
  X402SettlementResult,
  X402VerificationResult,
  X402Network,
  USDC_ADDRESSES,
  getDefaultFacilitator,
  ThirdwebFacilitator,
} from './x402/index.js';

/**
 * Payment configuration
 */
export interface PaymentServiceConfig {
  /** x402 facilitator instance */
  facilitator?: X402Facilitator;
  /** Default network */
  defaultNetwork?: X402Network;
  /** Server wallet address for receiving payments */
  serverWalletAddress: string;
  /** Demo mode */
  demoMode?: boolean;
  /** Fee percentage (0-100) */
  feePercentage?: number;
}

/**
 * Intent payment details
 */
export interface IntentPayment {
  /** Intent ID */
  intentId: string;
  /** Client wallet address */
  clientAddress: string;
  /** Provider wallet address */
  providerAddress: string;
  /** Bid amount in USDC */
  amount: string;
  /** Network */
  network: X402Network;
}

/**
 * Payment settlement result
 */
export interface PaymentSettlement {
  /** Intent ID */
  intentId: string;
  /** Whether settlement succeeded */
  success: boolean;
  /** Transaction hash */
  txHash?: string;
  /** Amount settled */
  amount: string;
  /** Provider address */
  providerAddress: string;
  /** Network */
  network: X402Network;
  /** Platform fee collected */
  platformFee?: string;
  /** Net amount to provider */
  netAmount?: string;
  /** Error if failed */
  error?: string;
  /** Settlement timestamp */
  settledAt: number;
}

/**
 * Escrow entry
 */
export interface EscrowEntry {
  /** Intent ID */
  intentId: string;
  /** Client address */
  clientAddress: string;
  /** Max budget escrowed */
  maxBudget: string;
  /** Payment payload from client */
  paymentPayload?: X402PaymentPayload;
  /** Status */
  status: 'held' | 'released' | 'refunded' | 'expired';
  /** Creation timestamp */
  createdAt: number;
  /** Expiry timestamp */
  expiresAt: number;
}

interface PaymentServiceEvents {
  'escrow:created': (entry: EscrowEntry) => void;
  'escrow:released': (entry: EscrowEntry, settlement: PaymentSettlement) => void;
  'escrow:refunded': (entry: EscrowEntry) => void;
  'payment:verified': (intentId: string, result: X402VerificationResult) => void;
  'payment:settled': (settlement: PaymentSettlement) => void;
  'payment:failed': (intentId: string, error: string) => void;
}

/**
 * Payment Service
 *
 * Manages the full payment lifecycle for intents:
 * 1. Escrow creation (client deposits max budget)
 * 2. Payment verification (when provider submits result)
 * 3. Settlement (release funds to winning provider)
 * 4. Refund (return excess funds to client)
 *
 * Integrates with:
 * - x402 for payment verification and settlement
 * - Crossmint for wallet operations (optional)
 *
 * Usage:
 * ```typescript
 * const paymentService = new PaymentService({
 *   serverWalletAddress: '0x...',
 *   defaultNetwork: 'base-sepolia',
 * });
 *
 * // Create escrow for intent
 * await paymentService.createEscrow({
 *   intentId: 'intent_123',
 *   clientAddress: '0xClient...',
 *   maxBudget: '0.10',
 *   paymentPayload: clientPaymentPayload,
 * });
 *
 * // Settle payment to provider
 * const settlement = await paymentService.settlePayment({
 *   intentId: 'intent_123',
 *   clientAddress: '0xClient...',
 *   providerAddress: '0xProvider...',
 *   amount: '0.05',
 *   network: 'base-sepolia',
 * });
 * ```
 */
export class PaymentService extends EventEmitter<PaymentServiceEvents> {
  private config: PaymentServiceConfig;
  private facilitator: X402Facilitator;
  private escrows: Map<string, EscrowEntry> = new Map();
  private settlements: Map<string, PaymentSettlement> = new Map();

  constructor(config: PaymentServiceConfig) {
    super();
    this.config = {
      defaultNetwork: 'base-sepolia',
      feePercentage: 5, // 5% platform fee
      demoMode: false,
      ...config,
    };
    this.facilitator = config.facilitator || getDefaultFacilitator();
  }

  // ============================================================
  // ESCROW MANAGEMENT
  // ============================================================

  /**
   * Create an escrow for an intent
   */
  async createEscrow(params: {
    intentId: string;
    clientAddress: string;
    maxBudget: string;
    paymentPayload?: X402PaymentPayload;
    expiresInMs?: number;
  }): Promise<EscrowEntry> {
    const now = Date.now();
    const expiresAt = now + (params.expiresInMs || 30 * 60 * 1000); // 30 minutes default

    const entry: EscrowEntry = {
      intentId: params.intentId,
      clientAddress: params.clientAddress,
      maxBudget: params.maxBudget,
      paymentPayload: params.paymentPayload,
      status: 'held',
      createdAt: now,
      expiresAt,
    };

    // Verify payment if payload provided
    if (params.paymentPayload) {
      const requirements = this.createPaymentRequirements(
        params.maxBudget,
        this.config.serverWalletAddress,
        this.config.defaultNetwork!
      );

      const verification = await this.facilitator.verify(
        params.paymentPayload,
        requirements
      );

      if (!verification.valid) {
        throw new Error(`Payment verification failed: ${verification.error}`);
      }
    }

    this.escrows.set(params.intentId, entry);
    this.emit('escrow:created', entry);

    return entry;
  }

  /**
   * Get escrow for an intent
   */
  getEscrow(intentId: string): EscrowEntry | null {
    return this.escrows.get(intentId) || null;
  }

  /**
   * Release escrow and settle payment to provider
   */
  async releaseEscrow(intentId: string, payment: IntentPayment): Promise<PaymentSettlement> {
    const escrow = this.escrows.get(intentId);
    if (!escrow) {
      throw new Error(`Escrow not found for intent ${intentId}`);
    }

    if (escrow.status !== 'held') {
      throw new Error(`Escrow already ${escrow.status}`);
    }

    // Settle the payment
    const settlement = await this.settlePayment(payment);

    if (settlement.success) {
      escrow.status = 'released';
      this.emit('escrow:released', escrow, settlement);
    }

    return settlement;
  }

  /**
   * Refund escrow to client
   */
  async refundEscrow(intentId: string): Promise<void> {
    const escrow = this.escrows.get(intentId);
    if (!escrow) {
      throw new Error(`Escrow not found for intent ${intentId}`);
    }

    if (escrow.status !== 'held') {
      throw new Error(`Escrow already ${escrow.status}`);
    }

    // In demo mode or when using pre-authorized payments,
    // we just mark as refunded (no actual transfer needed since
    // funds were never moved from client)
    escrow.status = 'refunded';
    this.emit('escrow:refunded', escrow);
  }

  /**
   * Clean up expired escrows
   */
  cleanupExpiredEscrows(): number {
    const now = Date.now();
    let count = 0;

    for (const [intentId, escrow] of this.escrows.entries()) {
      if (escrow.status === 'held' && escrow.expiresAt < now) {
        escrow.status = 'expired';
        this.emit('escrow:refunded', escrow);
        count++;
      }
    }

    return count;
  }

  // ============================================================
  // PAYMENT VERIFICATION & SETTLEMENT
  // ============================================================

  /**
   * Verify an x402 payment
   */
  async verifyPayment(
    intentId: string,
    payload: X402PaymentPayload,
    expectedAmount: string,
    recipientAddress: string
  ): Promise<X402VerificationResult> {
    const requirements = this.createPaymentRequirements(
      expectedAmount,
      recipientAddress,
      payload.network
    );

    const result = await this.facilitator.verify(payload, requirements);
    this.emit('payment:verified', intentId, result);

    return result;
  }

  /**
   * Settle a payment to provider
   */
  async settlePayment(payment: IntentPayment): Promise<PaymentSettlement> {
    const network = payment.network || this.config.defaultNetwork!;

    // Calculate fees
    const amountBigInt = this.parseAmount(payment.amount);
    const feeRate = BigInt(this.config.feePercentage || 5);
    const platformFee = (amountBigInt * feeRate) / BigInt(100);
    const netAmount = amountBigInt - platformFee;

    try {
      let settlement: PaymentSettlement;

      if (this.config.demoMode || this.facilitator instanceof ThirdwebFacilitator && (this.facilitator as ThirdwebFacilitator).isDemoMode) {
        // Demo mode - simulate settlement
        settlement = await this.simulateSettlement(payment, netAmount, platformFee);
      } else {
        // Real settlement through facilitator
        const escrow = this.escrows.get(payment.intentId);

        if (escrow?.paymentPayload) {
          // Use escrowed payment
          const requirements = this.createPaymentRequirements(
            payment.amount,
            payment.providerAddress,
            network
          );

          const result = await this.facilitator.settle(
            escrow.paymentPayload,
            requirements
          );

          settlement = {
            intentId: payment.intentId,
            success: result.success,
            txHash: result.txHash,
            amount: payment.amount,
            providerAddress: payment.providerAddress,
            network,
            platformFee: this.formatAmount(platformFee),
            netAmount: this.formatAmount(netAmount),
            error: result.error,
            settledAt: Date.now(),
          };
        } else {
          // No escrowed payment - create direct settlement
          // This would typically be done via the provider's x402 endpoint
          settlement = {
            intentId: payment.intentId,
            success: false,
            amount: payment.amount,
            providerAddress: payment.providerAddress,
            network,
            error: 'No payment payload in escrow - use provider x402 endpoint',
            settledAt: Date.now(),
          };
        }
      }

      this.settlements.set(payment.intentId, settlement);

      if (settlement.success) {
        this.emit('payment:settled', settlement);
      } else {
        this.emit('payment:failed', payment.intentId, settlement.error || 'Settlement failed');
      }

      return settlement;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('payment:failed', payment.intentId, errorMessage);

      return {
        intentId: payment.intentId,
        success: false,
        amount: payment.amount,
        providerAddress: payment.providerAddress,
        network,
        error: errorMessage,
        settledAt: Date.now(),
      };
    }
  }

  /**
   * Get settlement for an intent
   */
  getSettlement(intentId: string): PaymentSettlement | null {
    return this.settlements.get(intentId) || null;
  }

  // ============================================================
  // PAYMENT REQUIREMENTS
  // ============================================================

  /**
   * Create x402 middleware config for a provider endpoint
   */
  createMiddlewareConfig(
    price: string,
    recipientAddress: string,
    description?: string
  ): X402MiddlewareConfig {
    return {
      price,
      network: this.config.defaultNetwork!,
      tokenAddress: USDC_ADDRESSES[this.config.defaultNetwork!],
      tokenSymbol: 'USDC',
      recipient: recipientAddress,
      description,
      facilitator: this.facilitator,
      demoMode: this.config.demoMode,
    };
  }

  /**
   * Create payment requirements
   */
  createPaymentRequirements(
    amount: string,
    recipient: string,
    network: X402Network
  ): X402PaymentRequirements {
    return {
      scheme: 'exact',
      network,
      tokenAddress: USDC_ADDRESSES[network],
      tokenSymbol: 'USDC',
      amount,
      recipient,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    };
  }

  // ============================================================
  // STATISTICS
  // ============================================================

  /**
   * Get payment statistics
   */
  getStats(): {
    totalEscrows: number;
    activeEscrows: number;
    totalSettlements: number;
    successfulSettlements: number;
    totalVolume: string;
    totalFees: string;
  } {
    const escrowArray = Array.from(this.escrows.values());
    const settlementArray = Array.from(this.settlements.values());

    const successfulSettlements = settlementArray.filter(s => s.success);
    const totalVolume = successfulSettlements.reduce(
      (sum, s) => sum + this.parseAmount(s.amount),
      BigInt(0)
    );
    const totalFees = successfulSettlements.reduce(
      (sum, s) => sum + this.parseAmount(s.platformFee || '0'),
      BigInt(0)
    );

    return {
      totalEscrows: escrowArray.length,
      activeEscrows: escrowArray.filter(e => e.status === 'held').length,
      totalSettlements: settlementArray.length,
      successfulSettlements: successfulSettlements.length,
      totalVolume: this.formatAmount(totalVolume),
      totalFees: this.formatAmount(totalFees),
    };
  }

  // ============================================================
  // UTILITY
  // ============================================================

  /**
   * Check if in demo mode
   */
  get isDemoMode(): boolean {
    return this.config.demoMode || false;
  }

  /**
   * Get server wallet address
   */
  get serverWallet(): string {
    return this.config.serverWalletAddress;
  }

  /**
   * Get default network
   */
  get network(): X402Network {
    return this.config.defaultNetwork!;
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  private async simulateSettlement(
    payment: IntentPayment,
    netAmount: bigint,
    platformFee: bigint
  ): Promise<PaymentSettlement> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

    // Generate fake tx hash
    const txHash = `0x${Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('')}`;

    return {
      intentId: payment.intentId,
      success: true,
      txHash,
      amount: payment.amount,
      providerAddress: payment.providerAddress,
      network: payment.network,
      platformFee: this.formatAmount(platformFee),
      netAmount: this.formatAmount(netAmount),
      settledAt: Date.now(),
    };
  }

  private parseAmount(amount: string): bigint {
    const [whole, decimal = ''] = amount.split('.');
    const paddedDecimal = decimal.padEnd(6, '0').slice(0, 6);
    return BigInt(whole + paddedDecimal);
  }

  private formatAmount(amount: bigint): string {
    const str = amount.toString().padStart(7, '0');
    const whole = str.slice(0, -6) || '0';
    const decimal = str.slice(-6);
    return `${whole}.${decimal}`;
  }
}

// ============================================================
// FACTORY FUNCTIONS
// ============================================================

/**
 * Create a payment service
 */
export function createPaymentService(config: PaymentServiceConfig): PaymentService {
  return new PaymentService(config);
}

// Singleton instance
let paymentServiceInstance: PaymentService | null = null;

/**
 * Get default payment service
 */
export function getPaymentService(config?: PaymentServiceConfig): PaymentService {
  if (!paymentServiceInstance) {
    paymentServiceInstance = new PaymentService(
      config || {
        serverWalletAddress: process.env.X402_SERVER_WALLET || '',
        defaultNetwork: (process.env.X402_NETWORK as X402Network) || 'base-sepolia',
        demoMode: process.env.X402_DEMO_MODE === 'true',
      }
    );
  }
  return paymentServiceInstance;
}

/**
 * Reset payment service
 */
export function resetPaymentService(): void {
  paymentServiceInstance = null;
}
