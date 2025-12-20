// ============================================================
// SYNAPSE Escrow Manager
// Holds funds during intent execution and releases on completion
// ============================================================

import { EventEmitter } from 'eventemitter3';
import { nanoid } from 'nanoid';

export enum EscrowStatus {
  CREATED = 'CREATED',
  FUNDED = 'FUNDED',
  RELEASED = 'RELEASED',
  REFUNDED = 'REFUNDED',
  DISPUTED = 'DISPUTED',
  SLASHED = 'SLASHED'
}

export interface Escrow {
  id: string;
  intentId: string;
  clientAddress: string;
  amount: number;
  currency: string;
  status: EscrowStatus;
  createdAt: number;
  fundedAt?: number;
  releasedAt?: number;
  refundedAt?: number;
  recipientAddress?: string;
  releasedAmount?: number;
  refundedAmount?: number;
  slashedAmount?: number;
  transactionHashes: {
    deposit?: string;
    release?: string;
    refund?: string;
    slash?: string;
  };
}

export interface EscrowDeposit {
  intentId: string;
  clientAddress: string;
  amount: number;
  currency?: string;
}

export interface EscrowRelease {
  escrowId: string;
  recipientAddress: string;
  amount: number;
  reason?: string;
}

interface EscrowManagerEvents {
  'escrow:created': (escrow: Escrow) => void;
  'escrow:funded': (escrow: Escrow, txHash: string) => void;
  'escrow:released': (escrow: Escrow, amount: number, recipient: string) => void;
  'escrow:refunded': (escrow: Escrow, amount: number) => void;
  'escrow:slashed': (escrow: Escrow, amount: number, reason: string) => void;
  'escrow:disputed': (escrow: Escrow) => void;
}

/**
 * Escrow Manager
 *
 * Manages fund escrow for intent execution.
 * Holds client funds until intent is completed or fails.
 */
export class EscrowManager extends EventEmitter<EscrowManagerEvents> {
  private escrows: Map<string, Escrow> = new Map();
  private escrowsByIntent: Map<string, string> = new Map();
  private totalEscrowed: number = 0;
  private totalReleased: number = 0;
  private totalRefunded: number = 0;

  /**
   * Create and fund an escrow for an intent
   */
  async createEscrow(deposit: EscrowDeposit): Promise<Escrow> {
    const escrowId = `esc_${nanoid(12)}`;
    const now = Date.now();

    const escrow: Escrow = {
      id: escrowId,
      intentId: deposit.intentId,
      clientAddress: deposit.clientAddress,
      amount: deposit.amount,
      currency: deposit.currency || 'USDC',
      status: EscrowStatus.CREATED,
      createdAt: now,
      transactionHashes: {}
    };

    this.escrows.set(escrowId, escrow);
    this.escrowsByIntent.set(deposit.intentId, escrowId);

    this.emit('escrow:created', escrow);

    // Simulate funding (in production, this would interact with Crossmint wallet)
    await this.fundEscrow(escrowId);

    return escrow;
  }

  /**
   * Fund an escrow (deposit funds from client wallet)
   */
  private async fundEscrow(escrowId: string): Promise<void> {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) throw new Error(`Escrow ${escrowId} not found`);

    if (escrow.status !== EscrowStatus.CREATED) {
      throw new Error(`Escrow ${escrowId} already funded`);
    }

    // Simulate transaction (in production, this would call Crossmint API)
    const txHash = `0x${Date.now().toString(16)}${nanoid(16)}`;

    escrow.status = EscrowStatus.FUNDED;
    escrow.fundedAt = Date.now();
    escrow.transactionHashes.deposit = txHash;

    this.totalEscrowed += escrow.amount;
    this.escrows.set(escrowId, escrow);

    this.emit('escrow:funded', escrow, txHash);
  }

  /**
   * Release funds to provider on successful completion
   */
  async release(params: EscrowRelease): Promise<{
    txHash: string;
    amount: number;
    refundAmount: number;
  }> {
    const escrow = this.escrows.get(params.escrowId);
    if (!escrow) throw new Error(`Escrow ${params.escrowId} not found`);

    if (escrow.status !== EscrowStatus.FUNDED) {
      throw new Error(`Escrow ${params.escrowId} is not in funded state`);
    }

    if (params.amount > escrow.amount) {
      throw new Error(`Release amount ${params.amount} exceeds escrow ${escrow.amount}`);
    }

    // Simulate x402 payment (in production, this goes through thirdweb facilitator)
    const txHash = `0x${Date.now().toString(16)}${nanoid(16)}`;
    const refundAmount = escrow.amount - params.amount;

    escrow.status = EscrowStatus.RELEASED;
    escrow.releasedAt = Date.now();
    escrow.recipientAddress = params.recipientAddress;
    escrow.releasedAmount = params.amount;
    escrow.refundedAmount = refundAmount;
    escrow.transactionHashes.release = txHash;

    this.totalReleased += params.amount;
    if (refundAmount > 0) {
      this.totalRefunded += refundAmount;
    }

    this.escrows.set(params.escrowId, escrow);
    this.emit('escrow:released', escrow, params.amount, params.recipientAddress);

    return {
      txHash,
      amount: params.amount,
      refundAmount
    };
  }

  /**
   * Full refund to client (intent failed or cancelled)
   */
  async refund(escrowId: string, reason?: string): Promise<{
    txHash: string;
    amount: number;
  }> {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) throw new Error(`Escrow ${escrowId} not found`);

    if (escrow.status !== EscrowStatus.FUNDED && escrow.status !== EscrowStatus.DISPUTED) {
      throw new Error(`Escrow ${escrowId} cannot be refunded`);
    }

    // Simulate refund transaction
    const txHash = `0x${Date.now().toString(16)}${nanoid(16)}`;

    escrow.status = EscrowStatus.REFUNDED;
    escrow.refundedAt = Date.now();
    escrow.refundedAmount = escrow.amount;
    escrow.transactionHashes.refund = txHash;

    this.totalRefunded += escrow.amount;
    this.escrows.set(escrowId, escrow);

    this.emit('escrow:refunded', escrow, escrow.amount);

    return {
      txHash,
      amount: escrow.amount
    };
  }

  /**
   * Slash a portion of escrow (for provider penalties)
   */
  async slash(
    escrowId: string,
    amount: number,
    recipientAddress: string,
    reason: string
  ): Promise<{
    txHash: string;
    slashedAmount: number;
    remainingAmount: number;
  }> {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) throw new Error(`Escrow ${escrowId} not found`);

    if (escrow.status !== EscrowStatus.FUNDED) {
      throw new Error(`Escrow ${escrowId} is not funded`);
    }

    const slashAmount = Math.min(amount, escrow.amount);
    const remainingAmount = escrow.amount - slashAmount;

    // Simulate slash transaction
    const txHash = `0x${Date.now().toString(16)}${nanoid(16)}`;

    escrow.status = EscrowStatus.SLASHED;
    escrow.slashedAmount = slashAmount;
    escrow.refundedAmount = remainingAmount;
    escrow.transactionHashes.slash = txHash;

    this.escrows.set(escrowId, escrow);
    this.emit('escrow:slashed', escrow, slashAmount, reason);

    return {
      txHash,
      slashedAmount: slashAmount,
      remainingAmount
    };
  }

  /**
   * Mark escrow as disputed
   */
  dispute(escrowId: string): Escrow {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) throw new Error(`Escrow ${escrowId} not found`);

    if (escrow.status !== EscrowStatus.FUNDED) {
      throw new Error(`Escrow ${escrowId} cannot be disputed`);
    }

    escrow.status = EscrowStatus.DISPUTED;
    this.escrows.set(escrowId, escrow);
    this.emit('escrow:disputed', escrow);

    return escrow;
  }

  /**
   * Get escrow by ID
   */
  getEscrow(escrowId: string): Escrow | undefined {
    return this.escrows.get(escrowId);
  }

  /**
   * Get escrow by intent ID
   */
  getEscrowByIntent(intentId: string): Escrow | undefined {
    const escrowId = this.escrowsByIntent.get(intentId);
    if (!escrowId) return undefined;
    return this.escrows.get(escrowId);
  }

  /**
   * Get all escrows for a client
   */
  getEscrowsByClient(clientAddress: string): Escrow[] {
    return Array.from(this.escrows.values())
      .filter(e => e.clientAddress === clientAddress);
  }

  /**
   * Get escrow statistics
   */
  getStats(): {
    totalEscrows: number;
    activeEscrows: number;
    totalEscrowed: number;
    totalReleased: number;
    totalRefunded: number;
    pendingAmount: number;
  } {
    const escrows = Array.from(this.escrows.values());
    const activeEscrows = escrows.filter(e => e.status === EscrowStatus.FUNDED);
    const pendingAmount = activeEscrows.reduce((sum, e) => sum + e.amount, 0);

    return {
      totalEscrows: escrows.length,
      activeEscrows: activeEscrows.length,
      totalEscrowed: this.totalEscrowed,
      totalReleased: this.totalReleased,
      totalRefunded: this.totalRefunded,
      pendingAmount
    };
  }

  /**
   * Check if intent has active escrow
   */
  hasActiveEscrow(intentId: string): boolean {
    const escrow = this.getEscrowByIntent(intentId);
    return escrow?.status === EscrowStatus.FUNDED;
  }

  /**
   * Clear all escrows (for testing)
   */
  clear(): void {
    this.escrows.clear();
    this.escrowsByIntent.clear();
    this.totalEscrowed = 0;
    this.totalReleased = 0;
    this.totalRefunded = 0;
  }
}

// Singleton instance
let escrowManagerInstance: EscrowManager | null = null;

export function getEscrowManager(): EscrowManager {
  if (!escrowManagerInstance) {
    escrowManagerInstance = new EscrowManager();
  }
  return escrowManagerInstance;
}

export function resetEscrowManager(): void {
  escrowManagerInstance = null;
}
