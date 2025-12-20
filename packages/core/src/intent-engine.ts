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

export class IntentEngine extends EventEmitter<IntentEngineEvents> {
  private intents: Map<string, Intent> = new Map();
  private bids: Map<string, Bid[]> = new Map(); // intentId -> bids
  private bidScorer: BidScorer;
  private biddingTimers: Map<string, NodeJS.Timeout> = new Map();
  private executionTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
    this.bidScorer = new BidScorer();
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

    const bids = this.bids.get(intentId) || [];

    if (bids.length === 0) {
      // No bids received
      intent.status = IntentStatus.FAILED;
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

      this.emit('failover:triggered', intent, failedProvider!, nextProvider);
      this.emit('intent:updated', intent);

      // Start new execution timer
      this.startExecutionTimer(intent);
    } else {
      // No more failover options
      intent.status = IntentStatus.FAILED;
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
    this.emit('intent:updated', intent);
    return true;
  }

  // For testing/demo - force close bidding immediately
  forceCloseBidding(intentId: string): void {
    const timer = this.biddingTimers.get(intentId);
    if (timer) {
      clearTimeout(timer);
      this.biddingTimers.delete(intentId);
    }
    this.closeBidding(intentId);
  }
}

// Singleton instance for the application
let engineInstance: IntentEngine | null = null;

export function getIntentEngine(): IntentEngine {
  if (!engineInstance) {
    engineInstance = new IntentEngine();
  }
  return engineInstance;
}

export function resetIntentEngine(): void {
  engineInstance = null;
}
