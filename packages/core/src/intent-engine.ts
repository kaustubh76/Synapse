// ============================================================
// SYNAPSE INTENT ENGINE
// Core logic for creating, managing, and fulfilling intents
// ============================================================

import { EventEmitter } from 'eventemitter3';
import { nanoid } from 'nanoid';
import {
  Intent,
  IntentStatus,
  CreateIntentRequest,
  Bid,
  BidStatus,
  BidSubmission,
  WSEventType,
  SYNAPSE_CONSTANTS,
  IntentResult
} from '@synapse/types';
import { BidScorer } from './bid-scorer.js';

interface IntentEngineEvents {
  'intent:created': (intent: Intent) => void;
  'intent:updated': (intent: Intent) => void;
  'intent:completed': (intent: Intent) => void;
  'intent:failed': (intent: Intent, reason: string) => void;
  'bid:received': (bid: Bid, intent: Intent) => void;
  'bid:updated': (bid: Bid) => void;
  'winner:selected': (bid: Bid, intent: Intent) => void;
  'failover:triggered': (intent: Intent, failedProvider: string, newProvider: string) => void;
  'payment:settled': (intent: Intent, amount: number, txHash: string) => void;
}

// Configuration for memory management
interface IntentEngineConfig {
  // How long to keep completed/failed intents (default: 1 hour)
  retentionPeriodMs?: number;
  // How often to run cleanup (default: 5 minutes)
  cleanupIntervalMs?: number;
  // Maximum number of intents to keep in memory
  maxIntents?: number;
  // Maximum number of bids per intent to keep
  maxBidsPerIntent?: number;
}

const DEFAULT_CONFIG: Required<IntentEngineConfig> = {
  retentionPeriodMs: 60 * 60 * 1000, // 1 hour
  cleanupIntervalMs: 5 * 60 * 1000,   // 5 minutes
  maxIntents: 10000,
  maxBidsPerIntent: 100,
};

// Statistics for monitoring
interface EngineStats {
  totalIntentsCreated: number;
  totalIntentsCompleted: number;
  totalIntentsFailed: number;
  totalIntentsCancelled: number;
  totalBidsReceived: number;
  totalFailovers: number;
  cleanupRuns: number;
  intentsCleanedUp: number;
  activeIntents: number;
  activeTimers: number;
}

export class IntentEngine extends EventEmitter<IntentEngineEvents> {
  private intents: Map<string, Intent> = new Map();
  private bids: Map<string, Bid[]> = new Map(); // intentId -> bids
  private bidScorer: BidScorer;
  private biddingTimers: Map<string, NodeJS.Timeout> = new Map();
  private executionTimers: Map<string, NodeJS.Timeout> = new Map();

  // Memory management
  private config: Required<IntentEngineConfig>;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private stats: EngineStats = {
    totalIntentsCreated: 0,
    totalIntentsCompleted: 0,
    totalIntentsFailed: 0,
    totalIntentsCancelled: 0,
    totalBidsReceived: 0,
    totalFailovers: 0,
    cleanupRuns: 0,
    intentsCleanedUp: 0,
    activeIntents: 0,
    activeTimers: 0,
  };

  constructor(config: IntentEngineConfig = {}) {
    super();
    this.bidScorer = new BidScorer();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Start periodic cleanup
    this.startCleanupTimer();
  }

  // -------------------- MEMORY MANAGEMENT --------------------

  /**
   * Start periodic cleanup of old intents
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);

    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop cleanup timer
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Clean up old completed/failed intents to free memory
   */
  cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.config.retentionPeriodMs;
    let cleanedUp = 0;

    const terminalStatuses = [
      IntentStatus.COMPLETED,
      IntentStatus.FAILED,
      IntentStatus.CANCELLED,
    ];

    for (const [intentId, intent] of this.intents) {
      // Only clean up terminal state intents that are old enough
      if (terminalStatuses.includes(intent.status)) {
        const completedAt = intent.result?.completedAt || intent.createdAt;
        if (completedAt < cutoff) {
          // Clean up bids for this intent
          this.bids.delete(intentId);

          // Clean up any stale timers (shouldn't exist, but defensive)
          this.clearBiddingTimer(intentId);
          this.clearExecutionTimer(intentId);

          // Remove intent
          this.intents.delete(intentId);
          cleanedUp++;
        }
      }
    }

    // Also enforce max intents limit
    if (this.intents.size > this.config.maxIntents) {
      // Remove oldest terminal intents first
      const sortedIntents = Array.from(this.intents.entries())
        .filter(([, i]) => terminalStatuses.includes(i.status))
        .sort(([, a], [, b]) => a.createdAt - b.createdAt);

      while (this.intents.size > this.config.maxIntents && sortedIntents.length > 0) {
        const [intentId] = sortedIntents.shift()!;
        this.intents.delete(intentId);
        this.bids.delete(intentId);
        cleanedUp++;
      }
    }

    this.stats.cleanupRuns++;
    this.stats.intentsCleanedUp += cleanedUp;

    if (cleanedUp > 0) {
      console.log(`[IntentEngine] Cleaned up ${cleanedUp} old intents. Active: ${this.intents.size}`);
    }
  }

  /**
   * Clear bidding timer for intent
   */
  private clearBiddingTimer(intentId: string): void {
    const timer = this.biddingTimers.get(intentId);
    if (timer) {
      clearTimeout(timer);
      this.biddingTimers.delete(intentId);
    }
  }

  /**
   * Get engine statistics
   */
  getStats(): EngineStats {
    return {
      ...this.stats,
      activeIntents: this.intents.size,
      activeTimers: this.biddingTimers.size + this.executionTimers.size,
    };
  }

  /**
   * Get memory usage info
   */
  getMemoryUsage(): {
    intents: number;
    bids: number;
    biddingTimers: number;
    executionTimers: number;
  } {
    let totalBids = 0;
    for (const bids of this.bids.values()) {
      totalBids += bids.length;
    }

    return {
      intents: this.intents.size,
      bids: totalBids,
      biddingTimers: this.biddingTimers.size,
      executionTimers: this.executionTimers.size,
    };
  }

  // -------------------- INTENT CREATION --------------------

  createIntent(request: CreateIntentRequest, clientAddress: string): Intent {
    const now = Date.now();
    const biddingDuration = request.biddingDuration || SYNAPSE_CONSTANTS.DEFAULT_BIDDING_DURATION;
    const executionTimeout = request.executionTimeout || SYNAPSE_CONSTANTS.DEFAULT_EXECUTION_TIMEOUT;

    const intent: Intent = {
      id: `int_${nanoid(16)}`,
      clientAddress,
      type: request.type,
      category: request.category,
      params: request.params,
      maxBudget: request.maxBudget,
      currency: request.currency || 'USDC',
      requirements: {
        minReputation: request.requirements?.minReputation ?? 0,
        requireTEE: request.requirements?.requireTEE ?? false,
        preferredProviders: request.requirements?.preferredProviders ?? [],
        excludedProviders: request.requirements?.excludedProviders ?? [],
        maxLatency: request.requirements?.maxLatency
      },
      createdAt: now,
      biddingDeadline: now + biddingDuration,
      executionDeadline: now + biddingDuration + executionTimeout,
      status: IntentStatus.OPEN,
      failoverQueue: []
    };

    this.intents.set(intent.id, intent);
    this.bids.set(intent.id, []);

    // Start bidding timer
    this.startBiddingTimer(intent);

    // Track stats
    this.stats.totalIntentsCreated++;

    this.emit('intent:created', intent);
    return intent;
  }

  // -------------------- BIDDING --------------------

  submitBid(submission: BidSubmission, providerInfo: {
    address: string;
    id: string;
    reputationScore: number;
    teeAttested: boolean;
    capabilities: string[];
  }): Bid | null {
    const intent = this.intents.get(submission.intentId);

    if (!intent) {
      console.error(`Intent ${submission.intentId} not found`);
      return null;
    }

    if (intent.status !== IntentStatus.OPEN) {
      console.error(`Intent ${submission.intentId} is not accepting bids`);
      return null;
    }

    if (Date.now() > intent.biddingDeadline) {
      console.error(`Bidding deadline passed for intent ${submission.intentId}`);
      return null;
    }

    // Validate bid amount
    if (submission.bidAmount > intent.maxBudget) {
      console.error(`Bid amount ${submission.bidAmount} exceeds max budget ${intent.maxBudget}`);
      return null;
    }

    if (submission.bidAmount < SYNAPSE_CONSTANTS.MIN_BID_AMOUNT) {
      console.error(`Bid amount ${submission.bidAmount} below minimum`);
      return null;
    }

    // Check requirements
    if (intent.requirements.minReputation &&
        providerInfo.reputationScore < intent.requirements.minReputation) {
      console.error(`Provider reputation ${providerInfo.reputationScore} below required ${intent.requirements.minReputation}`);
      return null;
    }

    if (intent.requirements.requireTEE && !providerInfo.teeAttested) {
      console.error(`Intent requires TEE attestation`);
      return null;
    }

    if (intent.requirements.excludedProviders?.includes(providerInfo.address)) {
      console.error(`Provider ${providerInfo.address} is excluded`);
      return null;
    }

    // Check for duplicate bid
    const existingBids = this.bids.get(submission.intentId) || [];
    if (existingBids.some(b => b.providerAddress === providerInfo.address)) {
      console.error(`Provider ${providerInfo.address} already bid on this intent`);
      return null;
    }

    const bid: Bid = {
      id: `bid_${nanoid(12)}`,
      intentId: submission.intentId,
      providerAddress: providerInfo.address,
      providerId: providerInfo.id,
      bidAmount: submission.bidAmount,
      estimatedTime: submission.estimatedTime,
      confidence: submission.confidence,
      reputationScore: providerInfo.reputationScore,
      teeAttested: providerInfo.teeAttested,
      capabilities: providerInfo.capabilities,
      calculatedScore: 0,
      rank: 0,
      submittedAt: Date.now(),
      expiresAt: intent.executionDeadline,
      status: BidStatus.PENDING
    };

    // Calculate score
    bid.calculatedScore = this.bidScorer.calculateScore(bid, intent);

    // Add bid and re-rank all bids
    existingBids.push(bid);
    this.rankBids(existingBids);
    this.bids.set(submission.intentId, existingBids);

    // Track stats
    this.stats.totalBidsReceived++;

    this.emit('bid:received', bid, intent);
    return bid;
  }

  private rankBids(bids: Bid[]): void {
    // Sort by score descending
    bids.sort((a, b) => b.calculatedScore - a.calculatedScore);

    // Assign ranks
    bids.forEach((bid, index) => {
      bid.rank = index + 1;
    });
  }

  getBidsForIntent(intentId: string): Bid[] {
    return this.bids.get(intentId) || [];
  }

  // -------------------- WINNER SELECTION --------------------

  private startBiddingTimer(intent: Intent): void {
    const timeUntilDeadline = intent.biddingDeadline - Date.now();

    const timer = setTimeout(() => {
      this.closeBidding(intent.id);
    }, Math.max(0, timeUntilDeadline));

    this.biddingTimers.set(intent.id, timer);
  }

  private closeBidding(intentId: string): void {
    const intent = this.intents.get(intentId);
    if (!intent || intent.status !== IntentStatus.OPEN) return;

    // Clean up bidding timer
    this.clearBiddingTimer(intentId);

    const bids = this.bids.get(intentId) || [];

    if (bids.length === 0) {
      // No bids received
      intent.status = IntentStatus.FAILED;
      this.stats.totalIntentsFailed++;
      this.emit('intent:failed', intent, 'No bids received');
      return;
    }

    intent.status = IntentStatus.BIDDING_CLOSED;
    this.emit('intent:updated', intent);

    // Select winner (highest scored bid)
    this.selectWinner(intentId);
  }

  selectWinner(intentId: string): Bid | null {
    const intent = this.intents.get(intentId);
    if (!intent) return null;

    const bids = this.bids.get(intentId) || [];
    const pendingBids = bids.filter(b => b.status === BidStatus.PENDING);

    if (pendingBids.length === 0) {
      intent.status = IntentStatus.FAILED;
      this.emit('intent:failed', intent, 'No eligible bids');
      return null;
    }

    // Get highest scored bid
    const winner = pendingBids.reduce((best, bid) =>
      bid.calculatedScore > best.calculatedScore ? bid : best
    );

    // Update winner
    winner.status = BidStatus.ACCEPTED;
    this.emit('bid:updated', winner);

    // Set failover queue (other bids in score order)
    const failoverBids = pendingBids
      .filter(b => b.id !== winner.id)
      .sort((a, b) => b.calculatedScore - a.calculatedScore);

    failoverBids.forEach(bid => {
      bid.status = BidStatus.FAILOVER;
    });

    intent.assignedProvider = winner.providerAddress;
    intent.failoverQueue = failoverBids.map(b => b.providerAddress);
    intent.status = IntentStatus.ASSIGNED;

    this.emit('winner:selected', winner, intent);
    this.emit('intent:updated', intent);

    // Start execution timer
    this.startExecutionTimer(intent);

    return winner;
  }

  // -------------------- EXECUTION --------------------

  private startExecutionTimer(intent: Intent): void {
    const timer = setTimeout(() => {
      this.handleExecutionTimeout(intent.id);
    }, SYNAPSE_CONSTANTS.FAILOVER_TIMEOUT);

    this.executionTimers.set(intent.id, timer);
  }

  private clearExecutionTimer(intentId: string): void {
    const timer = this.executionTimers.get(intentId);
    if (timer) {
      clearTimeout(timer);
      this.executionTimers.delete(intentId);
    }
  }

  markExecutionStarted(intentId: string): void {
    const intent = this.intents.get(intentId);
    if (!intent || intent.status !== IntentStatus.ASSIGNED) return;

    intent.status = IntentStatus.EXECUTING;
    this.emit('intent:updated', intent);

    // Reset execution timer with longer timeout
    this.clearExecutionTimer(intentId);
    const remainingTime = intent.executionDeadline - Date.now();

    const timer = setTimeout(() => {
      this.handleExecutionTimeout(intentId);
    }, Math.max(0, remainingTime));

    this.executionTimers.set(intentId, timer);
  }

  submitResult(intentId: string, result: Omit<IntentResult, 'completedAt'>): boolean {
    const intent = this.intents.get(intentId);
    if (!intent) return false;

    if (intent.status !== IntentStatus.EXECUTING && intent.status !== IntentStatus.ASSIGNED) {
      console.error(`Intent ${intentId} is not in executable state`);
      return false;
    }

    // Verify the provider is assigned
    if (intent.assignedProvider !== result.providerId) {
      console.error(`Provider ${result.providerId} is not assigned to intent ${intentId}`);
      return false;
    }

    this.clearExecutionTimer(intentId);

    intent.result = {
      ...result,
      completedAt: Date.now()
    };
    intent.status = IntentStatus.COMPLETED;

    // Update winning bid status
    const bids = this.bids.get(intentId) || [];
    const winningBid = bids.find(b => b.providerAddress === result.providerId);
    if (winningBid) {
      winningBid.status = BidStatus.EXECUTED;
      this.emit('bid:updated', winningBid);
    }

    // Track stats
    this.stats.totalIntentsCompleted++;

    this.emit('intent:completed', intent);
    return true;
  }

  // -------------------- FAILOVER --------------------

  private handleExecutionTimeout(intentId: string): void {
    const intent = this.intents.get(intentId);
    if (!intent) return;

    if (intent.status === IntentStatus.COMPLETED) return;

    const failedProvider = intent.assignedProvider;

    // Mark current provider's bid as failed
    const bids = this.bids.get(intentId) || [];
    const failedBid = bids.find(b => b.providerAddress === failedProvider);
    if (failedBid) {
      failedBid.status = BidStatus.FAILED;
      this.emit('bid:updated', failedBid);
    }

    // Try failover
    if (intent.failoverQueue.length > 0) {
      const nextProvider = intent.failoverQueue.shift()!;
      intent.assignedProvider = nextProvider;
      intent.status = IntentStatus.ASSIGNED;

      // Update new provider's bid
      const newBid = bids.find(b => b.providerAddress === nextProvider);
      if (newBid) {
        newBid.status = BidStatus.ACCEPTED;
        this.emit('bid:updated', newBid);
      }

      // Track stats
      this.stats.totalFailovers++;

      this.emit('failover:triggered', intent, failedProvider!, nextProvider);
      this.emit('intent:updated', intent);

      // Start new execution timer
      this.startExecutionTimer(intent);
    } else {
      // No more failover options
      intent.status = IntentStatus.FAILED;
      this.stats.totalIntentsFailed++;
      this.emit('intent:failed', intent, 'All providers failed');
    }
  }

  triggerFailover(intentId: string): boolean {
    this.handleExecutionTimeout(intentId);
    return true;
  }

  // -------------------- PAYMENT --------------------

  recordPayment(intentId: string, amount: number, txHash: string): void {
    const intent = this.intents.get(intentId);
    if (!intent || !intent.result) return;

    intent.result.settlementTx = txHash;
    intent.result.settledAmount = amount;

    this.emit('payment:settled', intent, amount, txHash);
  }

  // -------------------- QUERIES --------------------

  getIntent(intentId: string): Intent | undefined {
    return this.intents.get(intentId);
  }

  getIntentsByClient(clientAddress: string): Intent[] {
    return Array.from(this.intents.values())
      .filter(i => i.clientAddress === clientAddress);
  }

  getIntentsByProvider(providerAddress: string): Intent[] {
    return Array.from(this.intents.values())
      .filter(i => i.assignedProvider === providerAddress);
  }

  getOpenIntents(): Intent[] {
    return Array.from(this.intents.values())
      .filter(i => i.status === IntentStatus.OPEN);
  }

  getOpenIntentsByType(type: string): Intent[] {
    return this.getOpenIntents().filter(i => i.type === type);
  }

  // -------------------- CLEANUP --------------------

  cancelIntent(intentId: string, clientAddress: string): boolean {
    const intent = this.intents.get(intentId);
    if (!intent) return false;
    if (intent.clientAddress !== clientAddress) return false;
    if (intent.status === IntentStatus.COMPLETED ||
        intent.status === IntentStatus.EXECUTING) {
      return false;
    }

    this.clearExecutionTimer(intentId);
    const biddingTimer = this.biddingTimers.get(intentId);
    if (biddingTimer) {
      clearTimeout(biddingTimer);
      this.biddingTimers.delete(intentId);
    }

    intent.status = IntentStatus.CANCELLED;
    this.stats.totalIntentsCancelled++;
    this.emit('intent:updated', intent);
    return true;
  }

  // For testing/demo - force close bidding immediately
  forceCloseBidding(intentId: string): void {
    this.clearBiddingTimer(intentId);
    this.closeBidding(intentId);
  }

  /**
   * Destroy engine and clean up all resources
   */
  destroy(): void {
    // Stop cleanup timer
    this.stopCleanupTimer();

    // Clear all bidding timers
    for (const timer of this.biddingTimers.values()) {
      clearTimeout(timer);
    }
    this.biddingTimers.clear();

    // Clear all execution timers
    for (const timer of this.executionTimers.values()) {
      clearTimeout(timer);
    }
    this.executionTimers.clear();

    // Remove all event listeners
    this.removeAllListeners();

    // Clear data
    this.intents.clear();
    this.bids.clear();

    console.log('[IntentEngine] Destroyed and cleaned up all resources');
  }
}

// Singleton instance for the application
let engineInstance: IntentEngine | null = null;

export function getIntentEngine(config?: IntentEngineConfig): IntentEngine {
  if (!engineInstance) {
    engineInstance = new IntentEngine(config);
  }
  return engineInstance;
}

export function resetIntentEngine(): void {
  if (engineInstance) {
    engineInstance.destroy();
  }
  engineInstance = null;
}
