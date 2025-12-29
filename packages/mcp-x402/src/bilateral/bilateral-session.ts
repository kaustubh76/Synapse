// ============================================================
// BILATERAL SESSION MANAGER
// Enables MCPs to be both payer AND payee in the same session
// Tracks role switches and settles net balance at session end
// ============================================================

import { EventEmitter } from 'eventemitter3';
import { nanoid } from 'nanoid';
import { ethers } from 'ethers';
import type { MCPIdentity } from '../identity/mcp-identity.js';
import { getUSDCTransfer } from '../verification/usdc-transfer.js';

// -------------------- TYPES --------------------

export type ParticipantRole = 'client' | 'server';

export interface BilateralTransaction {
  /** Unique transaction ID */
  id: string;
  /** Who paid */
  payer: ParticipantRole;
  /** Who received */
  payee: ParticipantRole;
  /** Amount in USDC */
  amount: number;
  /** Resource/tool that was paid for */
  resource: string;
  /** Optional description */
  description?: string;
  /** Transaction timestamp */
  timestamp: number;
  /** Transaction status */
  status: 'pending' | 'recorded' | 'settled' | 'disputed';
}

export interface BilateralSession {
  /** Unique session ID */
  sessionId: string;
  /** Client identity */
  clientId: string;
  clientAddress: string;
  /** Server identity */
  serverId: string;
  serverAddress: string;
  /** All transactions in this session */
  transactions: BilateralTransaction[];
  /** Running totals */
  clientPaidTotal: number;  // Total client paid to server
  serverPaidTotal: number;  // Total server paid to client
  /** Net balance (positive = server owes client, negative = client owes server) */
  netBalance: number;
  /** Session creation time */
  createdAt: number;
  /** Session status */
  status: 'active' | 'settling' | 'settled' | 'expired';
  /** Network for settlement */
  network: 'base' | 'base-sepolia';
}

export interface SettlementResult {
  /** Session that was settled */
  sessionId: string;
  /** Net amount to transfer */
  netAmount: number;
  /** Direction of transfer */
  direction: 'client-to-server' | 'server-to-client' | 'none';
  /** From address */
  from: string;
  /** To address */
  to: string;
  /** Transaction hash (if settled on-chain) */
  txHash?: string;
  /** Block number (if settled on-chain) */
  blockNumber?: number;
  /** Explorer URL (if settled on-chain) */
  explorerUrl?: string;
  /** Settlement timestamp */
  settledAt: number;
  /** Total transactions in session */
  transactionCount: number;
}

export interface BilateralSessionConfig {
  /** Network for settlements */
  network?: 'base' | 'base-sepolia';
  /** Session expiry in ms (default: 1 hour) */
  sessionExpiry?: number;
  /** Minimum amount to settle (below this, skip on-chain) */
  minimumSettlement?: number;
}

interface BilateralSessionEvents {
  'session:created': (session: BilateralSession) => void;
  'transaction:recorded': (tx: BilateralTransaction, session: BilateralSession) => void;
  'session:settling': (session: BilateralSession) => void;
  'session:settled': (result: SettlementResult) => void;
  'session:expired': (session: BilateralSession) => void;
}

// -------------------- BILATERAL SESSION MANAGER --------------------

export class BilateralSessionManager extends EventEmitter<BilateralSessionEvents> {
  private sessions: Map<string, BilateralSession> = new Map();
  private config: Required<BilateralSessionConfig>;

  constructor(config: BilateralSessionConfig = {}) {
    super();
    this.config = {
      network: config.network || 'base-sepolia',
      sessionExpiry: config.sessionExpiry || 60 * 60 * 1000, // 1 hour
      minimumSettlement: config.minimumSettlement || 0.001, // $0.001 USDC
    };
  }

  /**
   * Create a new bilateral session between client and server
   */
  createSession(
    client: { id: string; address: string },
    server: { id: string; address: string }
  ): BilateralSession {
    const sessionId = `bilateral_${nanoid(16)}`;

    const session: BilateralSession = {
      sessionId,
      clientId: client.id,
      clientAddress: client.address,
      serverId: server.id,
      serverAddress: server.address,
      transactions: [],
      clientPaidTotal: 0,
      serverPaidTotal: 0,
      netBalance: 0,
      createdAt: Date.now(),
      status: 'active',
      network: this.config.network,
    };

    this.sessions.set(sessionId, session);
    this.emit('session:created', session);

    console.log(`[Bilateral] Session created: ${sessionId}`);
    console.log(`[Bilateral]   Client: ${client.address}`);
    console.log(`[Bilateral]   Server: ${server.address}`);

    return session;
  }

  /**
   * Record a payment from client to server (normal tool usage)
   */
  recordClientPayment(
    sessionId: string,
    amount: number,
    resource: string,
    description?: string
  ): BilateralTransaction {
    return this.recordTransaction(sessionId, 'client', 'server', amount, resource, description);
  }

  /**
   * Record a payment from server to client (client provides value)
   */
  recordServerPayment(
    sessionId: string,
    amount: number,
    resource: string,
    description?: string
  ): BilateralTransaction {
    return this.recordTransaction(sessionId, 'server', 'client', amount, resource, description);
  }

  /**
   * Record a transaction between participants
   */
  private recordTransaction(
    sessionId: string,
    payer: ParticipantRole,
    payee: ParticipantRole,
    amount: number,
    resource: string,
    description?: string
  ): BilateralTransaction {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== 'active') {
      throw new Error(`Session is not active: ${session.status}`);
    }

    const tx: BilateralTransaction = {
      id: `tx_${nanoid(12)}`,
      payer,
      payee,
      amount,
      resource,
      description,
      timestamp: Date.now(),
      status: 'recorded',
    };

    // Update session totals
    session.transactions.push(tx);

    if (payer === 'client') {
      session.clientPaidTotal += amount;
    } else {
      session.serverPaidTotal += amount;
    }

    // Net balance: positive = server owes client, negative = client owes server
    session.netBalance = session.serverPaidTotal - session.clientPaidTotal;

    this.emit('transaction:recorded', tx, session);

    console.log(`[Bilateral] Transaction recorded: ${tx.id}`);
    console.log(`[Bilateral]   ${payer} -> ${payee}: $${amount} USDC for "${resource}"`);
    console.log(`[Bilateral]   Net balance: $${session.netBalance.toFixed(6)} USDC`);

    return tx;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): BilateralSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get session balance summary
   */
  getSessionBalance(sessionId: string): {
    clientPaid: number;
    serverPaid: number;
    netBalance: number;
    transactionCount: number;
    direction: 'client-to-server' | 'server-to-client' | 'none';
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    let direction: 'client-to-server' | 'server-to-client' | 'none' = 'none';
    if (session.netBalance > 0) {
      direction = 'server-to-client'; // Server owes client
    } else if (session.netBalance < 0) {
      direction = 'client-to-server'; // Client owes server
    }

    return {
      clientPaid: session.clientPaidTotal,
      serverPaid: session.serverPaidTotal,
      netBalance: session.netBalance,
      transactionCount: session.transactions.length,
      direction,
    };
  }

  /**
   * Settle session - calculate net and prepare for on-chain settlement
   * Returns settlement result (actual on-chain tx handled separately)
   */
  async settleSession(sessionId: string): Promise<SettlementResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status === 'settled') {
      throw new Error('Session already settled');
    }

    session.status = 'settling';
    this.emit('session:settling', session);

    // Calculate net settlement
    const netAmount = Math.abs(session.netBalance);
    let direction: 'client-to-server' | 'server-to-client' | 'none' = 'none';
    let from = '';
    let to = '';

    if (session.netBalance > 0) {
      // Server owes client
      direction = 'server-to-client';
      from = session.serverAddress;
      to = session.clientAddress;
    } else if (session.netBalance < 0) {
      // Client owes server
      direction = 'client-to-server';
      from = session.clientAddress;
      to = session.serverAddress;
    }

    // Mark all transactions as settled
    for (const tx of session.transactions) {
      tx.status = 'settled';
    }

    session.status = 'settled';

    const result: SettlementResult = {
      sessionId,
      netAmount,
      direction,
      from,
      to,
      settledAt: Date.now(),
      transactionCount: session.transactions.length,
    };

    this.emit('session:settled', result);

    console.log(`[Bilateral] Session settled: ${sessionId}`);
    console.log(`[Bilateral]   Net: $${netAmount.toFixed(6)} USDC ${direction}`);
    console.log(`[Bilateral]   Transactions: ${session.transactions.length}`);

    return result;
  }

  /**
   * Settle session with REAL on-chain USDC payment
   * All settlements go to the platform wallet
   */
  async settleSessionWithPayment(
    sessionId: string,
    privateKey: string,
    platformWallet: string
  ): Promise<SettlementResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status === 'settled') {
      throw new Error('Session already settled');
    }

    // Calculate net amount
    const netAmount = Math.abs(session.netBalance);

    // If below minimum, just mark as settled without transfer
    if (netAmount < this.config.minimumSettlement) {
      console.log(`[Bilateral] Net amount $${netAmount} below minimum, settling without transfer`);
      return this.settleSession(sessionId);
    }

    session.status = 'settling';
    this.emit('session:settling', session);

    // Determine direction for accounting purposes
    const direction: 'client-to-server' | 'server-to-client' | 'none' =
      session.netBalance > 0 ? 'server-to-client' :
      session.netBalance < 0 ? 'client-to-server' : 'none';

    // Execute REAL USDC transfer to platform wallet
    console.log(`[Bilateral] Executing real USDC settlement: $${netAmount} to ${platformWallet}`);

    const usdcTransfer = getUSDCTransfer();
    const transferResult = await usdcTransfer.transferWithPrivateKey(privateKey, {
      recipient: platformWallet,
      amount: netAmount,
      reason: `Bilateral settlement: ${sessionId}`,
    });

    if (!transferResult.success || !transferResult.txHash) {
      session.status = 'active'; // Revert to active on failure
      throw new Error(`Settlement transfer failed: ${transferResult.error || 'Unknown error'}`);
    }

    // Mark all transactions as settled
    for (const tx of session.transactions) {
      tx.status = 'settled';
    }

    session.status = 'settled';

    const result: SettlementResult = {
      sessionId,
      netAmount,
      direction,
      from: session.clientAddress,
      to: platformWallet,
      txHash: transferResult.txHash,
      blockNumber: transferResult.blockNumber,
      explorerUrl: transferResult.explorerUrl,
      settledAt: Date.now(),
      transactionCount: session.transactions.length,
    };

    this.emit('session:settled', result);

    console.log(`[Bilateral] Real settlement complete!`);
    console.log(`[Bilateral]   TX: ${transferResult.txHash}`);
    console.log(`[Bilateral]   Block: ${transferResult.blockNumber}`);
    console.log(`[Bilateral]   Amount: $${netAmount} USDC`);
    console.log(`[Bilateral]   Explorer: ${transferResult.explorerUrl}`);

    return result;
  }

  /**
   * Record on-chain settlement transaction hash
   */
  recordSettlementTx(sessionId: string, txHash: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Store in session metadata (could be extended)
      console.log(`[Bilateral] Settlement tx recorded: ${txHash}`);
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): BilateralSession[] {
    return Array.from(this.sessions.values()).filter(s => s.status === 'active');
  }

  /**
   * Get sessions for a specific participant
   */
  getSessionsByParticipant(address: string): BilateralSession[] {
    return Array.from(this.sessions.values()).filter(
      s => s.clientAddress.toLowerCase() === address.toLowerCase() ||
           s.serverAddress.toLowerCase() === address.toLowerCase()
    );
  }

  /**
   * Expire old sessions
   */
  expireOldSessions(): number {
    const now = Date.now();
    let expiredCount = 0;

    for (const session of this.sessions.values()) {
      if (session.status === 'active' &&
          now - session.createdAt > this.config.sessionExpiry) {
        session.status = 'expired';
        this.emit('session:expired', session);
        expiredCount++;
      }
    }

    return expiredCount;
  }

  /**
   * Generate settlement signature for off-chain verification
   */
  generateSettlementMessage(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    const balance = this.getSessionBalance(sessionId)!;

    return JSON.stringify({
      sessionId,
      clientAddress: session.clientAddress,
      serverAddress: session.serverAddress,
      netAmount: Math.abs(session.netBalance),
      direction: balance.direction,
      transactionCount: session.transactions.length,
      timestamp: Date.now(),
    });
  }
}

// -------------------- SINGLETON --------------------

let managerInstance: BilateralSessionManager | null = null;

export function getBilateralSessionManager(config?: BilateralSessionConfig): BilateralSessionManager {
  if (!managerInstance) {
    managerInstance = new BilateralSessionManager(config);
  }
  return managerInstance;
}

export function resetBilateralSessionManager(): void {
  managerInstance = null;
}
