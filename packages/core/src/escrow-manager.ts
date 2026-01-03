// ============================================================
// SYNAPSE Escrow Manager
// Holds funds during intent execution and releases on completion
// NOW WITH REAL USDC TRANSFERS ON BASE SEPOLIA
// ============================================================

import { EventEmitter } from 'eventemitter3';
import { nanoid } from 'nanoid';
import { getUSDCTransfer, type TransferResult } from '@synapse/mcp-x402';

// -------------------- ESCROW CONFIGURATION --------------------

export interface EscrowConfig {
  /** Private key for escrow custody wallet */
  escrowPrivateKey?: string;
  /** Platform wallet address for fee collection */
  platformWallet?: string;
  /** Enable real USDC transfers (default: false for backward compatibility) */
  enableRealTransfers?: boolean;
  /** Network for blockchain operations */
  network?: 'base' | 'base-sepolia';
}

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
 *
 * NOW SUPPORTS REAL USDC TRANSFERS ON BASE SEPOLIA!
 */
export class EscrowManager extends EventEmitter<EscrowManagerEvents> {
  private escrows: Map<string, Escrow> = new Map();
  private escrowsByIntent: Map<string, string> = new Map();
  private totalEscrowed: number = 0;
  private totalReleased: number = 0;
  private totalRefunded: number = 0;

  // Configuration for real blockchain integration
  private config: Required<EscrowConfig>;

  constructor(config: EscrowConfig = {}) {
    super();
    this.config = {
      escrowPrivateKey: config.escrowPrivateKey || process.env.ESCROW_PRIVATE_KEY || '',
      platformWallet: config.platformWallet || process.env.PLATFORM_WALLET || '',
      enableRealTransfers: config.enableRealTransfers ?? (process.env.ENABLE_REAL_ESCROW === 'true'),
      network: config.network || 'base-sepolia',
    };

    if (this.config.enableRealTransfers) {
      console.log('[EscrowManager] REAL USDC transfers ENABLED on', this.config.network);
    }
  }

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
   * Supports both simulated and real USDC transfers
   */
  private async fundEscrow(escrowId: string, clientPrivateKey?: string): Promise<void> {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) throw new Error(`Escrow ${escrowId} not found`);

    if (escrow.status !== EscrowStatus.CREATED) {
      throw new Error(`Escrow ${escrowId} already funded`);
    }

    let txHash: string;

    // Check if real transfers are enabled
    if (this.config.enableRealTransfers && clientPrivateKey && this.config.platformWallet) {
      // Execute REAL USDC transfer from client to escrow/platform wallet
      console.log(`[EscrowManager] Executing REAL USDC transfer: $${escrow.amount} from client to ${this.config.platformWallet}`);

      const usdcTransfer = getUSDCTransfer();
      const result = await usdcTransfer.transferWithPrivateKey(clientPrivateKey, {
        recipient: this.config.platformWallet,
        amount: escrow.amount,
        reason: `Escrow deposit for ${escrowId}`,
      });

      if (!result.success || !result.txHash) {
        throw new Error(`Escrow funding failed: ${result.error || 'Unknown error'}`);
      }

      txHash = result.txHash;
      console.log(`[EscrowManager] REAL deposit confirmed: ${txHash}`);
      console.log(`[EscrowManager] Block: ${result.blockNumber}, Explorer: ${result.explorerUrl}`);
    } else {
      // Simulate transaction (backward compatibility)
      txHash = `0x${Date.now().toString(16)}${nanoid(16)}`;
      console.log(`[EscrowManager] Simulated deposit: ${txHash}`);
    }

    escrow.status = EscrowStatus.FUNDED;
    escrow.fundedAt = Date.now();
    escrow.transactionHashes.deposit = txHash;

    this.totalEscrowed += escrow.amount;
    this.escrows.set(escrowId, escrow);

    this.emit('escrow:funded', escrow, txHash);
  }

  /**
   * Fund escrow with real USDC transfer
   * Call this after createEscrow to execute real blockchain deposit
   */
  async fundEscrowReal(escrowId: string, clientPrivateKey: string): Promise<TransferResult> {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) throw new Error(`Escrow ${escrowId} not found`);

    if (escrow.status !== EscrowStatus.CREATED) {
      throw new Error(`Escrow ${escrowId} already funded`);
    }

    if (!this.config.platformWallet) {
      throw new Error('Platform wallet not configured');
    }

    console.log(`[EscrowManager] Executing REAL USDC escrow deposit: $${escrow.amount}`);

    const usdcTransfer = getUSDCTransfer();
    const result = await usdcTransfer.transferWithPrivateKey(clientPrivateKey, {
      recipient: this.config.platformWallet,
      amount: escrow.amount,
      reason: `Escrow deposit: ${escrowId}`,
    });

    if (!result.success || !result.txHash) {
      throw new Error(`Escrow funding failed: ${result.error || 'Unknown error'}`);
    }

    // Update escrow state
    escrow.status = EscrowStatus.FUNDED;
    escrow.fundedAt = Date.now();
    escrow.transactionHashes.deposit = result.txHash;
    this.totalEscrowed += escrow.amount;
    this.escrows.set(escrowId, escrow);

    this.emit('escrow:funded', escrow, result.txHash);

    console.log(`[EscrowManager] REAL escrow funded!`);
    console.log(`[EscrowManager]   TX: ${result.txHash}`);
    console.log(`[EscrowManager]   Block: ${result.blockNumber}`);
    console.log(`[EscrowManager]   Explorer: ${result.explorerUrl}`);

    return result;
  }

  /**
   * Release funds to provider on successful completion
   * Automatically uses REAL USDC transfers when private key is configured
   */
  async release(params: EscrowRelease): Promise<{
    txHash: string;
    amount: number;
    refundAmount: number;
    blockNumber?: number;
    explorerUrl?: string;
  }> {
    const escrow = this.escrows.get(params.escrowId);
    if (!escrow) throw new Error(`Escrow ${params.escrowId} not found`);

    if (escrow.status !== EscrowStatus.FUNDED) {
      throw new Error(`Escrow ${params.escrowId} is not in funded state`);
    }

    if (params.amount > escrow.amount) {
      throw new Error(`Release amount ${params.amount} exceeds escrow ${escrow.amount}`);
    }

    // Use real USDC transfer if private key is configured
    if (this.config.escrowPrivateKey && this.config.enableRealTransfers !== false) {
      return this.releaseReal({ ...params, escrowPrivateKey: this.config.escrowPrivateKey });
    }

    // Fallback to simulation only if explicitly enabled or no private key
    const refundAmount = escrow.amount - params.amount;
    const txHash = `0xsim_${Date.now().toString(16)}${nanoid(16)}`;
    console.log(`[EscrowManager] Simulated release (no private key): ${txHash}`);

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
   * Release escrow with REAL USDC transfer to provider
   */
  async releaseReal(params: EscrowRelease & { escrowPrivateKey?: string }): Promise<{
    txHash: string;
    amount: number;
    refundAmount: number;
    blockNumber?: number;
    explorerUrl?: string;
  }> {
    const escrow = this.escrows.get(params.escrowId);
    if (!escrow) throw new Error(`Escrow ${params.escrowId} not found`);

    if (escrow.status !== EscrowStatus.FUNDED) {
      throw new Error(`Escrow ${params.escrowId} is not in funded state`);
    }

    if (params.amount > escrow.amount) {
      throw new Error(`Release amount ${params.amount} exceeds escrow ${escrow.amount}`);
    }

    const privateKey = params.escrowPrivateKey || this.config.escrowPrivateKey;
    if (!privateKey) {
      throw new Error('Escrow private key not configured');
    }

    const refundAmount = escrow.amount - params.amount;

    console.log(`[EscrowManager] Executing REAL USDC release: $${params.amount} to ${params.recipientAddress}`);

    const usdcTransfer = getUSDCTransfer();
    const result = await usdcTransfer.transferWithPrivateKey(privateKey, {
      recipient: params.recipientAddress,
      amount: params.amount,
      reason: `Escrow release: ${params.escrowId}`,
    });

    if (!result.success || !result.txHash) {
      throw new Error(`Escrow release failed: ${result.error || 'Unknown error'}`);
    }

    escrow.status = EscrowStatus.RELEASED;
    escrow.releasedAt = Date.now();
    escrow.recipientAddress = params.recipientAddress;
    escrow.releasedAmount = params.amount;
    escrow.refundedAmount = refundAmount;
    escrow.transactionHashes.release = result.txHash;

    this.totalReleased += params.amount;
    if (refundAmount > 0) {
      this.totalRefunded += refundAmount;
    }

    this.escrows.set(params.escrowId, escrow);
    this.emit('escrow:released', escrow, params.amount, params.recipientAddress);

    console.log(`[EscrowManager] REAL escrow released!`);
    console.log(`[EscrowManager]   TX: ${result.txHash}`);
    console.log(`[EscrowManager]   Block: ${result.blockNumber}`);
    console.log(`[EscrowManager]   Explorer: ${result.explorerUrl}`);

    return {
      txHash: result.txHash,
      amount: params.amount,
      refundAmount,
      blockNumber: result.blockNumber,
      explorerUrl: result.explorerUrl,
    };
  }

  /**
   * Full refund to client (intent failed or cancelled)
   * Automatically uses REAL USDC transfers when private key is configured
   */
  async refund(escrowId: string, reason?: string): Promise<{
    txHash: string;
    amount: number;
    blockNumber?: number;
    explorerUrl?: string;
  }> {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) throw new Error(`Escrow ${escrowId} not found`);

    if (escrow.status !== EscrowStatus.FUNDED && escrow.status !== EscrowStatus.DISPUTED) {
      throw new Error(`Escrow ${escrowId} cannot be refunded`);
    }

    // Use real USDC transfer if private key is configured
    if (this.config.escrowPrivateKey && this.config.enableRealTransfers !== false) {
      return this.refundReal(escrowId, this.config.escrowPrivateKey, reason);
    }

    // Fallback to simulation only if no private key
    const txHash = `0xsim_${Date.now().toString(16)}${nanoid(16)}`;
    console.log(`[EscrowManager] Simulated refund (no private key): ${txHash}`);

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
   * Full refund to client with REAL USDC transfer
   */
  async refundReal(escrowId: string, escrowPrivateKey?: string, reason?: string): Promise<{
    txHash: string;
    amount: number;
    blockNumber?: number;
    explorerUrl?: string;
  }> {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) throw new Error(`Escrow ${escrowId} not found`);

    if (escrow.status !== EscrowStatus.FUNDED && escrow.status !== EscrowStatus.DISPUTED) {
      throw new Error(`Escrow ${escrowId} cannot be refunded`);
    }

    const privateKey = escrowPrivateKey || this.config.escrowPrivateKey;
    if (!privateKey) {
      throw new Error('Escrow private key not configured');
    }

    console.log(`[EscrowManager] Executing REAL USDC refund: $${escrow.amount} to ${escrow.clientAddress}`);

    const usdcTransfer = getUSDCTransfer();
    const result = await usdcTransfer.transferWithPrivateKey(privateKey, {
      recipient: escrow.clientAddress,
      amount: escrow.amount,
      reason: reason || `Escrow refund: ${escrowId}`,
    });

    if (!result.success || !result.txHash) {
      throw new Error(`Escrow refund failed: ${result.error || 'Unknown error'}`);
    }

    escrow.status = EscrowStatus.REFUNDED;
    escrow.refundedAt = Date.now();
    escrow.refundedAmount = escrow.amount;
    escrow.transactionHashes.refund = result.txHash;

    this.totalRefunded += escrow.amount;
    this.escrows.set(escrowId, escrow);

    this.emit('escrow:refunded', escrow, escrow.amount);

    console.log(`[EscrowManager] REAL escrow refunded!`);
    console.log(`[EscrowManager]   TX: ${result.txHash}`);
    console.log(`[EscrowManager]   Block: ${result.blockNumber}`);
    console.log(`[EscrowManager]   Explorer: ${result.explorerUrl}`);

    return {
      txHash: result.txHash,
      amount: escrow.amount,
      blockNumber: result.blockNumber,
      explorerUrl: result.explorerUrl,
    };
  }

  /**
   * Slash a portion of escrow (for provider penalties)
   * Automatically uses REAL USDC transfers when private key is configured
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
    blockNumber?: number;
    explorerUrl?: string;
  }> {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) throw new Error(`Escrow ${escrowId} not found`);

    if (escrow.status !== EscrowStatus.FUNDED) {
      throw new Error(`Escrow ${escrowId} is not funded`);
    }

    // Use real USDC transfer if private key is configured
    if (this.config.escrowPrivateKey && this.config.enableRealTransfers !== false) {
      return this.slashReal(escrowId, amount, recipientAddress, reason, this.config.escrowPrivateKey);
    }

    // Fallback to simulation only if no private key
    const slashAmount = Math.min(amount, escrow.amount);
    const remainingAmount = escrow.amount - slashAmount;

    const txHash = `0xsim_${Date.now().toString(16)}${nanoid(16)}`;
    console.log(`[EscrowManager] Simulated slash (no private key): ${txHash}`);

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
   * Slash a portion of escrow with REAL USDC transfer
   * Transfers slashed amount to platform/penalty recipient
   */
  async slashReal(
    escrowId: string,
    amount: number,
    recipientAddress: string,
    reason: string,
    escrowPrivateKey?: string
  ): Promise<{
    txHash: string;
    slashedAmount: number;
    remainingAmount: number;
    blockNumber?: number;
    explorerUrl?: string;
  }> {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) throw new Error(`Escrow ${escrowId} not found`);

    if (escrow.status !== EscrowStatus.FUNDED) {
      throw new Error(`Escrow ${escrowId} is not funded`);
    }

    const privateKey = escrowPrivateKey || this.config.escrowPrivateKey;
    if (!privateKey) {
      throw new Error('Escrow private key not configured');
    }

    const slashAmount = Math.min(amount, escrow.amount);
    const remainingAmount = escrow.amount - slashAmount;

    console.log(`[EscrowManager] Executing REAL USDC slash: $${slashAmount} to ${recipientAddress}`);
    console.log(`[EscrowManager] Reason: ${reason}`);

    const usdcTransfer = getUSDCTransfer();
    const result = await usdcTransfer.transferWithPrivateKey(privateKey, {
      recipient: recipientAddress,
      amount: slashAmount,
      reason: `Escrow slash: ${reason}`,
    });

    if (!result.success || !result.txHash) {
      throw new Error(`Escrow slash failed: ${result.error || 'Unknown error'}`);
    }

    escrow.status = EscrowStatus.SLASHED;
    escrow.slashedAmount = slashAmount;
    escrow.refundedAmount = remainingAmount;
    escrow.transactionHashes.slash = result.txHash;

    this.escrows.set(escrowId, escrow);
    this.emit('escrow:slashed', escrow, slashAmount, reason);

    console.log(`[EscrowManager] REAL escrow slashed!`);
    console.log(`[EscrowManager]   TX: ${result.txHash}`);
    console.log(`[EscrowManager]   Block: ${result.blockNumber}`);
    console.log(`[EscrowManager]   Slashed: $${slashAmount}, Remaining: $${remainingAmount}`);
    console.log(`[EscrowManager]   Explorer: ${result.explorerUrl}`);

    return {
      txHash: result.txHash,
      slashedAmount: slashAmount,
      remainingAmount,
      blockNumber: result.blockNumber,
      explorerUrl: result.explorerUrl,
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

  /**
   * Get current configuration
   */
  getConfig(): Required<EscrowConfig> {
    return { ...this.config };
  }

  /**
   * Check if real transfers are enabled
   */
  isRealTransfersEnabled(): boolean {
    return this.config.enableRealTransfers;
  }
}

// Singleton instance
let escrowManagerInstance: EscrowManager | null = null;

export function getEscrowManager(config?: EscrowConfig): EscrowManager {
  if (!escrowManagerInstance) {
    escrowManagerInstance = new EscrowManager(config);
  }
  return escrowManagerInstance;
}

export function resetEscrowManager(): void {
  escrowManagerInstance = null;
}

// Re-export TransferResult for API routes
export type { TransferResult };
