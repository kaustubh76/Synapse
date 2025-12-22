// ============================================================
// AGENT WALLET - Cryptographic Identity for Autonomous Agents
// Revolutionary: Agents become first-class economic citizens
// ============================================================

import { EventEmitter } from 'eventemitter3';
import { X402Network, CHAIN_IDS, USDC_ADDRESSES } from '../types.js';

/**
 * Agent wallet configuration
 */
export interface AgentWalletConfig {
  /** Network for transactions */
  network: X402Network;
  /** Private key (if provided, otherwise generated) */
  privateKey?: string;
  /** Funding source strategy */
  fundingSource?: 'self' | 'operator' | 'both';
  /** Spending constraints set by operator */
  constraints?: SpendingConstraints;
  /** Operator address (for operator-funded wallets) */
  operatorAddress?: string;
}

/**
 * Spending constraints for autonomous agents
 */
export interface SpendingConstraints {
  /** Maximum amount per single transaction (USDC) */
  maxPerTransaction: string;
  /** Daily spending limit (USDC) */
  dailyLimit: string;
  /** Require human approval above this amount (USDC) */
  requireApprovalAbove: string;
  /** Maximum transactions per minute */
  maxTxPerMinute?: number;
  /** Allowed recipient addresses (empty = all allowed) */
  allowedRecipients?: string[];
  /** Blocked recipient addresses */
  blockedRecipients?: string[];
}

/**
 * Transaction record for audit trail
 */
export interface TransactionRecord {
  /** Unique transaction ID */
  id: string;
  /** Timestamp */
  timestamp: number;
  /** Recipient address */
  recipient: string;
  /** Amount in USDC */
  amount: string;
  /** Tool or resource being paid for */
  resource: string;
  /** Reason/description */
  reason: string;
  /** Transaction hash (if settled on-chain) */
  txHash?: string;
  /** Session ID */
  sessionId?: string;
  /** Parent transaction (if part of chain) */
  parentTx?: string;
  /** Risk score (0-1) */
  riskScore?: number;
  /** Status */
  status: 'pending' | 'signed' | 'settled' | 'failed';
}

/**
 * Wallet balance information
 */
export interface WalletBalance {
  /** USDC balance */
  usdc: string;
  /** Native token balance (for gas) */
  native: string;
  /** Pending outgoing payments */
  pendingOut: string;
  /** Available balance (usdc - pendingOut) */
  available: string;
}

/**
 * Wallet spending statistics
 */
export interface SpendingStats {
  /** Total spent in current session */
  sessionSpent: string;
  /** Total spent today */
  dailySpent: string;
  /** Total spent all time */
  totalSpent: string;
  /** Total earned all time */
  totalEarned: string;
  /** Transaction count today */
  dailyTxCount: number;
  /** Transactions in last minute */
  recentTxCount: number;
}

/**
 * Wallet events
 */
export interface WalletEvents {
  /** Balance changed */
  'balance:changed': (balance: WalletBalance) => void;
  /** Transaction signed */
  'tx:signed': (tx: TransactionRecord) => void;
  /** Transaction settled */
  'tx:settled': (tx: TransactionRecord) => void;
  /** Transaction failed */
  'tx:failed': (tx: TransactionRecord, error: string) => void;
  /** Spending limit reached */
  'limit:reached': (type: 'daily' | 'perTx' | 'rateLimit') => void;
  /** Approval required */
  'approval:required': (tx: TransactionRecord) => void;
  /** Anomaly detected */
  'anomaly:detected': (tx: TransactionRecord, reason: string) => void;
}

/**
 * AgentWallet - Cryptographic identity and wallet for autonomous agents
 *
 * This is the core primitive that makes agents first-class economic citizens.
 * Agents can:
 * - Hold their own funds
 * - Sign payments autonomously
 * - Track their spending
 * - Earn from providing services
 * - Operate within operator-defined constraints
 */
export class AgentWallet extends EventEmitter<WalletEvents> {
  private readonly network: X402Network;
  private readonly chainId: number;
  private readonly usdcAddress: string;
  private readonly constraints: SpendingConstraints;
  private readonly fundingSource: 'self' | 'operator' | 'both';

  // Wallet identity
  private privateKey: string;
  private _address: string;

  // State tracking
  private transactions: Map<string, TransactionRecord> = new Map();
  private sessionStart: number = Date.now();
  private dailyStart: number = this.getDayStart();
  private recentTxTimestamps: number[] = [];

  // Spending tracking
  private _sessionSpent: number = 0;
  private _dailySpent: number = 0;
  private _totalSpent: number = 0;
  private _totalEarned: number = 0;

  // Balance (cached, should be fetched from chain)
  private _balance: WalletBalance = {
    usdc: '0',
    native: '0',
    pendingOut: '0',
    available: '0',
  };

  private constructor(config: AgentWalletConfig) {
    super();

    this.network = config.network;
    this.chainId = CHAIN_IDS[config.network];
    this.usdcAddress = USDC_ADDRESSES[config.network];
    this.fundingSource = config.fundingSource || 'self';

    this.constraints = config.constraints || {
      maxPerTransaction: '100',
      dailyLimit: '1000',
      requireApprovalAbove: '50',
      maxTxPerMinute: 10,
    };

    // Generate or use provided private key
    this.privateKey = config.privateKey || this.generatePrivateKey();
    this._address = this.deriveAddress(this.privateKey);
  }

  /**
   * Create a new agent wallet
   */
  static async create(config: AgentWalletConfig): Promise<AgentWallet> {
    const wallet = new AgentWallet(config);
    return wallet;
  }

  /**
   * Restore wallet from private key
   */
  static async restore(privateKey: string, config: Omit<AgentWalletConfig, 'privateKey'>): Promise<AgentWallet> {
    return new AgentWallet({ ...config, privateKey });
  }

  /**
   * Get wallet address
   */
  get address(): string {
    return this._address;
  }

  /**
   * Get current balance
   */
  get balance(): WalletBalance {
    return { ...this._balance };
  }

  /**
   * Get spending statistics
   */
  get stats(): SpendingStats {
    this.cleanupRecentTx();
    return {
      sessionSpent: (this._sessionSpent / 1_000_000).toFixed(6),
      dailySpent: (this._dailySpent / 1_000_000).toFixed(6),
      totalSpent: (this._totalSpent / 1_000_000).toFixed(6),
      totalEarned: (this._totalEarned / 1_000_000).toFixed(6),
      dailyTxCount: this.getDailyTxCount(),
      recentTxCount: this.recentTxTimestamps.length,
    };
  }

  /**
   * Check if a payment can be made
   */
  canPay(amount: string, recipient: string): { allowed: boolean; reason?: string; requiresApproval?: boolean } {
    const amountMicro = Math.floor(parseFloat(amount) * 1_000_000);
    const maxPerTx = Math.floor(parseFloat(this.constraints.maxPerTransaction) * 1_000_000);
    const dailyLimit = Math.floor(parseFloat(this.constraints.dailyLimit) * 1_000_000);
    const approvalThreshold = Math.floor(parseFloat(this.constraints.requireApprovalAbove) * 1_000_000);

    // Check blocked recipients
    if (this.constraints.blockedRecipients?.includes(recipient)) {
      return { allowed: false, reason: 'Recipient is blocked' };
    }

    // Check allowed recipients (if whitelist is set)
    if (this.constraints.allowedRecipients?.length && !this.constraints.allowedRecipients.includes(recipient)) {
      return { allowed: false, reason: 'Recipient not in allowed list' };
    }

    // Check per-transaction limit
    if (amountMicro > maxPerTx) {
      return { allowed: false, reason: `Amount exceeds per-transaction limit of ${this.constraints.maxPerTransaction} USDC` };
    }

    // Check daily limit
    this.resetDailyIfNeeded();
    if (this._dailySpent + amountMicro > dailyLimit) {
      return { allowed: false, reason: `Would exceed daily limit of ${this.constraints.dailyLimit} USDC` };
    }

    // Check rate limit
    this.cleanupRecentTx();
    if (this.constraints.maxTxPerMinute && this.recentTxTimestamps.length >= this.constraints.maxTxPerMinute) {
      return { allowed: false, reason: `Rate limit: max ${this.constraints.maxTxPerMinute} transactions per minute` };
    }

    // Check available balance
    const available = parseInt(this._balance.available, 10);
    if (amountMicro > available) {
      return { allowed: false, reason: `Insufficient balance: ${this._balance.available} USDC available` };
    }

    // Check if approval required
    if (amountMicro > approvalThreshold) {
      return { allowed: true, requiresApproval: true };
    }

    return { allowed: true };
  }

  /**
   * Sign a payment authorization (EIP-712)
   */
  async signPayment(params: {
    recipient: string;
    amount: string;
    resource: string;
    reason: string;
    nonce: string;
    expiry: number;
    sessionId?: string;
    parentTx?: string;
  }): Promise<{ signature: string; txRecord: TransactionRecord }> {
    const { recipient, amount, resource, reason, nonce, expiry, sessionId, parentTx } = params;

    // Check if payment is allowed
    const check = this.canPay(amount, recipient);
    if (!check.allowed) {
      throw new Error(`Payment not allowed: ${check.reason}`);
    }

    // Create transaction record
    const txRecord: TransactionRecord = {
      id: this.generateTxId(),
      timestamp: Date.now(),
      recipient,
      amount,
      resource,
      reason,
      sessionId,
      parentTx,
      riskScore: this.calculateRiskScore(amount, recipient),
      status: 'pending',
    };

    // Check for anomalies
    const anomaly = this.detectAnomaly(txRecord);
    if (anomaly) {
      this.emit('anomaly:detected', txRecord, anomaly);
      // Don't block, just alert (configurable)
    }

    // Check if approval required
    if (check.requiresApproval) {
      txRecord.status = 'pending';
      this.transactions.set(txRecord.id, txRecord);
      this.emit('approval:required', txRecord);
      throw new Error('Human approval required for this transaction');
    }

    // Create EIP-712 typed data
    const typedData = {
      domain: {
        name: 'x402',
        version: '1',
        chainId: this.chainId,
      },
      types: {
        PaymentAuthorization: [
          { name: 'recipient', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'token', type: 'address' },
          { name: 'nonce', type: 'bytes32' },
          { name: 'expiry', type: 'uint256' },
          { name: 'resource', type: 'string' },
        ],
      },
      primaryType: 'PaymentAuthorization' as const,
      message: {
        recipient,
        amount: Math.floor(parseFloat(amount) * 1_000_000).toString(),
        token: this.usdcAddress,
        nonce,
        expiry,
        resource,
      },
    };

    // Sign the typed data
    const signature = await this.signTypedData(typedData);

    // Update transaction record
    txRecord.status = 'signed';
    this.transactions.set(txRecord.id, txRecord);

    // Track spending
    const amountMicro = Math.floor(parseFloat(amount) * 1_000_000);
    this._sessionSpent += amountMicro;
    this._dailySpent += amountMicro;
    this.recentTxTimestamps.push(Date.now());

    // Update pending balance
    const pendingOut = parseInt(this._balance.pendingOut, 10) + amountMicro;
    this._balance.pendingOut = pendingOut.toString();
    this._balance.available = (parseInt(this._balance.usdc, 10) - pendingOut).toString();

    this.emit('tx:signed', txRecord);

    return { signature, txRecord };
  }

  /**
   * Record a settled transaction
   */
  recordSettlement(txId: string, txHash: string): void {
    const tx = this.transactions.get(txId);
    if (!tx) {
      throw new Error(`Transaction ${txId} not found`);
    }

    tx.status = 'settled';
    tx.txHash = txHash;
    this.transactions.set(txId, tx);

    // Update total spent
    const amountMicro = Math.floor(parseFloat(tx.amount) * 1_000_000);
    this._totalSpent += amountMicro;

    // Update pending balance
    const pendingOut = Math.max(0, parseInt(this._balance.pendingOut, 10) - amountMicro);
    const usdc = Math.max(0, parseInt(this._balance.usdc, 10) - amountMicro);
    this._balance.pendingOut = pendingOut.toString();
    this._balance.usdc = usdc.toString();
    this._balance.available = (usdc - pendingOut).toString();

    this.emit('tx:settled', tx);
    this.emit('balance:changed', this._balance);
  }

  /**
   * Record a failed transaction
   */
  recordFailure(txId: string, error: string): void {
    const tx = this.transactions.get(txId);
    if (!tx) {
      throw new Error(`Transaction ${txId} not found`);
    }

    tx.status = 'failed';
    this.transactions.set(txId, tx);

    // Refund the pending amount
    const amountMicro = Math.floor(parseFloat(tx.amount) * 1_000_000);
    this._sessionSpent = Math.max(0, this._sessionSpent - amountMicro);
    this._dailySpent = Math.max(0, this._dailySpent - amountMicro);

    // Update pending balance
    const pendingOut = Math.max(0, parseInt(this._balance.pendingOut, 10) - amountMicro);
    this._balance.pendingOut = pendingOut.toString();
    this._balance.available = (parseInt(this._balance.usdc, 10) - pendingOut).toString();

    this.emit('tx:failed', tx, error);
    this.emit('balance:changed', this._balance);
  }

  /**
   * Record incoming payment (agent earning)
   */
  recordEarning(amount: string, from: string, resource: string): void {
    const amountMicro = Math.floor(parseFloat(amount) * 1_000_000);
    this._totalEarned += amountMicro;

    // Update balance
    const usdc = parseInt(this._balance.usdc, 10) + amountMicro;
    this._balance.usdc = usdc.toString();
    this._balance.available = (usdc - parseInt(this._balance.pendingOut, 10)).toString();

    this.emit('balance:changed', this._balance);
  }

  /**
   * Update balance from chain
   */
  updateBalance(usdc: string, native: string): void {
    this._balance.usdc = usdc;
    this._balance.native = native;
    this._balance.available = (parseInt(usdc, 10) - parseInt(this._balance.pendingOut, 10)).toString();
    this.emit('balance:changed', this._balance);
  }

  /**
   * Get transaction history
   */
  getTransactions(filter?: { status?: TransactionRecord['status']; since?: number }): TransactionRecord[] {
    let txs = Array.from(this.transactions.values());

    if (filter?.status) {
      txs = txs.filter(tx => tx.status === filter.status);
    }

    if (filter?.since !== undefined) {
      const since = filter.since;
      txs = txs.filter(tx => tx.timestamp >= since);
    }

    return txs.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Export audit log
   */
  exportAuditLog(): string {
    const transactions = this.getTransactions();
    const log = {
      wallet: this._address,
      network: this.network,
      exportedAt: new Date().toISOString(),
      stats: this.stats,
      transactions,
    };
    return JSON.stringify(log, null, 2);
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  private generatePrivateKey(): string {
    // Generate 32 random bytes for private key
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private deriveAddress(privateKey: string): string {
    // Simplified address derivation (in production, use proper crypto library)
    // This creates a deterministic "address" from the private key
    const keyBytes = privateKey.slice(2);
    const hash = this.simpleHash(keyBytes);
    return '0x' + hash.slice(-40);
  }

  private simpleHash(input: string): string {
    // Simple hash for demo (in production, use keccak256)
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(40, '0');
  }

  private async signTypedData(typedData: unknown): Promise<string> {
    // Simplified signature (in production, use proper EIP-712 signing)
    const dataString = JSON.stringify(typedData);
    const hash = this.simpleHash(dataString + this.privateKey);
    return '0x' + hash.padStart(130, '0');
  }

  private generateTxId(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return 'tx_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private getDayStart(): number {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }

  private resetDailyIfNeeded(): void {
    const currentDayStart = this.getDayStart();
    if (currentDayStart > this.dailyStart) {
      this.dailyStart = currentDayStart;
      this._dailySpent = 0;
    }
  }

  private getDailyTxCount(): number {
    const dayStart = this.getDayStart();
    return Array.from(this.transactions.values())
      .filter(tx => tx.timestamp >= dayStart)
      .length;
  }

  private cleanupRecentTx(): void {
    const oneMinuteAgo = Date.now() - 60_000;
    this.recentTxTimestamps = this.recentTxTimestamps.filter(ts => ts > oneMinuteAgo);
  }

  private calculateRiskScore(amount: string, recipient: string): number {
    let score = 0;
    const amountMicro = Math.floor(parseFloat(amount) * 1_000_000);
    const maxPerTx = Math.floor(parseFloat(this.constraints.maxPerTransaction) * 1_000_000);

    // Higher amount = higher risk
    score += (amountMicro / maxPerTx) * 0.3;

    // New recipient = higher risk
    const knownRecipient = Array.from(this.transactions.values())
      .some(tx => tx.recipient === recipient && tx.status === 'settled');
    if (!knownRecipient) {
      score += 0.2;
    }

    // High transaction frequency = higher risk
    this.cleanupRecentTx();
    const txFrequency = this.recentTxTimestamps.length / (this.constraints.maxTxPerMinute || 10);
    score += txFrequency * 0.2;

    // High daily spend = higher risk
    const dailyLimit = Math.floor(parseFloat(this.constraints.dailyLimit) * 1_000_000);
    const dailyUsage = this._dailySpent / dailyLimit;
    score += dailyUsage * 0.3;

    return Math.min(1, score);
  }

  private detectAnomaly(tx: TransactionRecord): string | null {
    // Unusual amount (> 2x average)
    const settledTxs = this.getTransactions({ status: 'settled' });
    if (settledTxs.length >= 5) {
      const avgAmount = settledTxs.reduce((sum, t) => sum + parseFloat(t.amount), 0) / settledTxs.length;
      if (parseFloat(tx.amount) > avgAmount * 2) {
        return `Unusual amount: ${tx.amount} USDC is more than 2x the average of ${avgAmount.toFixed(4)} USDC`;
      }
    }

    // Unusual time (configurable)
    const hour = new Date(tx.timestamp).getHours();
    if (hour >= 2 && hour <= 5) {
      return `Unusual time: Transaction at ${hour}:00 (typically low activity hours)`;
    }

    // Rapid consecutive transactions to same recipient
    const recentToSame = settledTxs
      .filter(t => t.recipient === tx.recipient && Date.now() - t.timestamp < 60_000)
      .length;
    if (recentToSame >= 3) {
      return `Rapid transactions: ${recentToSame} transactions to same recipient in last minute`;
    }

    return null;
  }
}

/**
 * Quick wallet creation for simple use cases
 */
export async function createAgentWallet(network: X402Network = 'base-sepolia'): Promise<AgentWallet> {
  return AgentWallet.create({ network });
}
