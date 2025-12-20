// ============================================================
// SYNAPSE MCP GATEWAY - Session Manager
// Manages MCP sessions with budget tracking
// ============================================================

import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';
import type {
  MCPSession,
  SessionState,
  SessionTransaction,
  SynapseAuthParams,
  SynapseBalanceResponse,
} from './types.js';

const DEFAULT_SESSION_DURATION = 60 * 60 * 1000; // 1 hour
const SESSION_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

export class SessionManager extends EventEmitter {
  private sessions: Map<string, MCPSession> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startCleanup();
  }

  /**
   * Create a new MCP session
   */
  createSession(
    clientInfo: { name: string; version: string },
    authParams?: SynapseAuthParams
  ): MCPSession {
    const sessionId = `mcp_session_${uuid().replace(/-/g, '').slice(0, 12)}`;
    const now = Date.now();

    const session: MCPSession = {
      id: sessionId,
      clientInfo,
      walletAddress: authParams?.walletAddress || `0x_demo_${sessionId.slice(-8)}`,
      budget: {
        initial: authParams?.budget || 10.0, // Default $10 budget
        spent: 0,
        remaining: authParams?.budget || 10.0,
      },
      state: 'active',
      createdAt: now,
      expiresAt: authParams?.validUntil || now + DEFAULT_SESSION_DURATION,
      lastActivity: now,
      transactions: [],
      stats: {
        toolsCalled: 0,
        uniqueTools: new Set(),
        providersUsed: new Set(),
        totalLatency: 0,
        errors: 0,
      },
    };

    this.sessions.set(sessionId, session);
    this.emit('session:created', session);

    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): MCPSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session && this.isSessionValid(session)) {
      return session;
    }
    return undefined;
  }

  /**
   * Check if session is valid
   */
  isSessionValid(session: MCPSession): boolean {
    const now = Date.now();

    if (session.state === 'closed' || session.state === 'settled') {
      return false;
    }

    if (now > session.expiresAt) {
      this.updateSessionState(session.id, 'expired');
      return false;
    }

    if (session.budget.remaining <= 0) {
      this.updateSessionState(session.id, 'budget_depleted');
      return false;
    }

    return true;
  }

  /**
   * Update session state
   */
  updateSessionState(sessionId: string, state: SessionState): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.state = state;
      this.emit('session:stateChanged', { sessionId, state });
    }
  }

  /**
   * Check if budget is sufficient for a transaction
   */
  hasSufficientBudget(sessionId: string, amount: number): boolean {
    const session = this.getSession(sessionId);
    if (!session) return false;
    return session.budget.remaining >= amount;
  }

  /**
   * Deduct from session budget
   */
  deductBudget(
    sessionId: string,
    amount: number,
    toolName: string,
    intentId: string,
    providerId: string,
    providerName: string
  ): SessionTransaction | null {
    const session = this.getSession(sessionId);
    if (!session) return null;

    if (!this.hasSufficientBudget(sessionId, amount)) {
      this.emit('session:budgetInsufficient', {
        sessionId,
        required: amount,
        available: session.budget.remaining,
      });
      return null;
    }

    const transaction: SessionTransaction = {
      id: `tx_${uuid().replace(/-/g, '').slice(0, 12)}`,
      timestamp: Date.now(),
      tool: toolName,
      intentId,
      providerId,
      providerName,
      amount,
      status: 'completed',
    };

    session.budget.spent += amount;
    session.budget.remaining -= amount;
    session.lastActivity = Date.now();
    session.transactions.push(transaction);

    // Update stats
    session.stats.toolsCalled++;
    session.stats.uniqueTools.add(toolName);
    session.stats.providersUsed.add(providerId);

    this.emit('session:budgetDeducted', {
      sessionId,
      transaction,
      remaining: session.budget.remaining,
    });

    // Check if budget is now depleted
    if (session.budget.remaining <= 0) {
      this.updateSessionState(sessionId, 'budget_depleted');
    }

    return transaction;
  }

  /**
   * Refund a transaction
   */
  refundTransaction(sessionId: string, transactionId: string): boolean {
    const session = this.getSession(sessionId);
    if (!session) return false;

    const transaction = session.transactions.find((t) => t.id === transactionId);
    if (!transaction || transaction.status !== 'completed') return false;

    transaction.status = 'refunded';
    session.budget.spent -= transaction.amount;
    session.budget.remaining += transaction.amount;

    this.emit('session:refunded', { sessionId, transaction });

    // If was budget depleted, restore to active
    if (session.state === 'budget_depleted' && session.budget.remaining > 0) {
      this.updateSessionState(sessionId, 'active');
    }

    return true;
  }

  /**
   * Record latency for a tool call
   */
  recordLatency(sessionId: string, latencyMs: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.stats.totalLatency += latencyMs;
    }
  }

  /**
   * Record an error
   */
  recordError(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.stats.errors++;
    }
  }

  /**
   * Get session balance
   */
  getBalance(sessionId: string): SynapseBalanceResponse | null {
    const session = this.getSession(sessionId);
    if (!session) return null;

    return {
      initial: session.budget.initial,
      spent: session.budget.spent,
      remaining: session.budget.remaining,
      transactions: session.transactions.length,
      lastUpdated: session.lastActivity,
    };
  }

  /**
   * Close session and settle
   */
  closeSession(sessionId: string): MCPSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.state = 'closed';
    this.emit('session:closed', session);

    return session;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): MCPSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.state === 'active' || s.state === 'initializing'
    );
  }

  /**
   * Get session stats
   */
  getSessionStats(sessionId: string): Record<string, unknown> | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const avgLatency =
      session.stats.toolsCalled > 0
        ? session.stats.totalLatency / session.stats.toolsCalled
        : 0;

    return {
      toolsCalled: session.stats.toolsCalled,
      uniqueTools: session.stats.uniqueTools.size,
      providersUsed: session.stats.providersUsed.size,
      avgLatency: Math.round(avgLatency),
      errors: session.stats.errors,
      successRate:
        session.stats.toolsCalled > 0
          ? (
              ((session.stats.toolsCalled - session.stats.errors) /
                session.stats.toolsCalled) *
              100
            ).toFixed(1)
          : '100.0',
    };
  }

  /**
   * Start cleanup interval
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, SESSION_CLEANUP_INTERVAL);
  }

  /**
   * Cleanup expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (
        now > session.expiresAt ||
        session.state === 'closed' ||
        session.state === 'settled'
      ) {
        if (session.state !== 'settled') {
          session.state = 'settled';
          this.emit('session:settled', session);
        }
        // Keep settled sessions for a while for audit
        if (now > session.expiresAt + 24 * 60 * 60 * 1000) {
          this.sessions.delete(sessionId);
        }
      }
    }
  }

  /**
   * Shutdown session manager
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Close all active sessions
    for (const session of this.sessions.values()) {
      if (session.state === 'active') {
        this.closeSession(session.id);
      }
    }
  }
}

// Singleton instance
let sessionManager: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!sessionManager) {
    sessionManager = new SessionManager();
  }
  return sessionManager;
}
