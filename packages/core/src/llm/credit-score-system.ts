// ============================================================
// SYNAPSE AGENT CREDIT SCORE SYSTEM
// ============================================================

import { EventEmitter } from 'events';
import {
  AgentCreditProfile,
  CreditTier,
  CreditFactors,
  CREDIT_TIER_CONFIG,
} from './types.js';
import { CreditPersistence, getCreditPersistence } from './credit-persistence.js';

export interface CreditTransaction {
  id: string;
  agentId: string;
  type: 'credit_used' | 'payment' | 'late_payment' | 'default';
  amount: number;
  timestamp: number;
  intentId?: string;
  status: 'pending' | 'completed' | 'failed';
  // Blockchain transaction linking
  txHash?: string;           // Real blockchain transaction hash
  blockNumber?: number;      // Block number for verification
  explorerUrl?: string;      // BaseScan link for easy verification
  // Anti-gaming tracking
  scoreImpact?: number;      // How much this payment affected the score
}

// Anti-gaming configuration
const ANTI_GAMING_CONFIG = {
  // Minimum time between score-impacting payments (in milliseconds)
  minPaymentInterval: 60 * 1000, // 1 minute

  // Minimum payment amount to count for score improvement
  minPaymentAmount: 0.01, // $0.01 USDC

  // Maximum payments that can impact score per hour
  maxPaymentsPerHour: 10,

  // Maximum payments that can impact score per day
  maxPaymentsPerDay: 50,

  // Base score increase per payment (before modifiers)
  baseScoreIncrease: 5,

  // Maximum score increase per payment
  maxScoreIncrease: 15,

  // Bonus multiplier for larger payments
  largePaymentThreshold: 1, // $1 USDC
  largePaymentBonus: 5,

  // Penalty for rapid small payments (potential gaming)
  rapidPaymentPenalty: 0.5, // 50% reduction in score impact
};

export interface CreditScorerConfig {
  persistencePath?: string;
  enablePersistence?: boolean;
  autoSaveInterval?: number;
}

export class AgentCreditScorer extends EventEmitter {
  private profiles: Map<string, AgentCreditProfile> = new Map();
  private transactions: Map<string, CreditTransaction[]> = new Map();
  private persistence: CreditPersistence | null = null;
  private initialized: boolean = false;
  private config: CreditScorerConfig;

  constructor(config: CreditScorerConfig = {}) {
    super();
    this.config = {
      enablePersistence: process.env.CREDIT_PERSISTENCE !== 'false',
      persistencePath: process.env.CREDIT_DB_PATH || './data/credit-scores.json',
      autoSaveInterval: 30000,
      ...config,
    };
  }

  // -------------------- INITIALIZATION --------------------

  /**
   * Initialize the credit scorer with persistence
   * This MUST be called before using the scorer if persistence is enabled
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.enablePersistence) {
      this.persistence = getCreditPersistence({
        dataPath: this.config.persistencePath,
        autoSaveInterval: this.config.autoSaveInterval,
        enableAutoSave: true,
      });

      await this.persistence.initialize();

      // Load existing data
      const data = await this.persistence.load();
      if (data) {
        this.profiles = new Map(Object.entries(data.profiles));
        this.transactions = new Map(Object.entries(data.transactions));
        console.log(
          `[AgentCreditScorer] Loaded ${this.profiles.size} profiles from persistence`
        );
      }

      // Start auto-save
      this.persistence.startAutoSave(
        () => this.profiles,
        () => this.transactions
      );
    }

    this.initialized = true;
    this.emit('initialized', { profileCount: this.profiles.size });
  }

  /**
   * Force save to persistence
   */
  async save(): Promise<void> {
    if (this.persistence) {
      await this.persistence.save(this.profiles, this.transactions);
    }
  }

  /**
   * Shutdown - save and cleanup
   */
  async shutdown(): Promise<void> {
    if (this.persistence) {
      this.persistence.stopAutoSave();
      await this.save();
    }
    this.initialized = false;
  }

  /**
   * Mark data as modified (needs saving)
   */
  private markDirty(): void {
    if (this.persistence) {
      this.persistence.markDirty();
    }
  }

  // -------------------- PROFILE MANAGEMENT --------------------

  async getOrCreateProfile(agentId: string, address: string): Promise<AgentCreditProfile> {
    if (this.profiles.has(agentId)) {
      return this.profiles.get(agentId)!;
    }

    // Create new profile with realistic starting score
    // New agents start in 'fair' tier and must build credit through payments
    const profile: AgentCreditProfile = {
      agentId,
      address,
      creditScore: 550, // Start at 'fair' tier - must build credit
      creditTier: 'fair',
      lastScoreUpdate: Date.now(),
      unsecuredCreditLimit: 200, // $200 starting limit for fair tier
      dailySpendLimit: 20,
      monthlySpendLimit: 200,
      currentDailySpend: 0,
      currentMonthlySpend: 0,
      currentBalance: 0,
      availableCredit: 200,
      totalTransactions: 0,
      successfulPayments: 0,
      latePayments: 0,
      defaults: 0,
      accountAge: 0,
      totalAmountPaid: 0,    // Track cumulative payments
      totalAmountOwed: 0,    // Track cumulative credit used
      factors: {
        paymentHistory: 50,   // Neutral start (was 100)
        creditUtilization: 100, // No balance = good
        accountAge: 30,       // New account (was 40)
        creditMix: 40,        // No variety yet (was 60)
        recentActivity: 50,   // No history (was 80)
      },
      stakedAmount: 0,
      collateralRatio: 0,
      tierDiscount: CREDIT_TIER_CONFIG.fair.rateDiscount,
    };

    this.profiles.set(agentId, profile);
    this.markDirty();
    this.emit('profile_created', { agentId, profile });

    return profile;
  }

  async getProfile(agentId: string): Promise<AgentCreditProfile | undefined> {
    return this.profiles.get(agentId);
  }

  // -------------------- CREDIT SCORE CALCULATION --------------------

  calculateCreditScore(profile: AgentCreditProfile): number {
    const weights = {
      paymentHistory: 0.35,
      creditUtilization: 0.30,
      accountAge: 0.15,
      creditMix: 0.10,
      recentActivity: 0.10,
    };

    // Calculate weighted score (0-100)
    const rawScore =
      profile.factors.paymentHistory * weights.paymentHistory +
      profile.factors.creditUtilization * weights.creditUtilization +
      profile.factors.accountAge * weights.accountAge +
      profile.factors.creditMix * weights.creditMix +
      profile.factors.recentActivity * weights.recentActivity;

    // Scale to 300-850 range
    const score = Math.round(300 + (rawScore * 5.5));
    return Math.max(300, Math.min(850, score));
  }

  // -------------------- FACTOR CALCULATIONS --------------------

  private calculatePaymentHistoryScore(profile: AgentCreditProfile): number {
    // New accounts start neutral, not perfect
    if (profile.totalTransactions === 0) return 50;

    const totalTxns = profile.totalTransactions;
    const successRate = profile.successfulPayments / totalTxns;
    const lateRate = profile.latePayments / totalTxns;
    const defaultRate = profile.defaults / totalTxns;

    // Calculate repayment ratio - how much of borrowed amount has been paid back
    const totalOwed = profile.totalAmountOwed || 1; // Avoid division by zero
    const repaymentRatio = Math.min(1, (profile.totalAmountPaid || 0) / totalOwed);

    // Combined score: 60% success rate + 40% repayment ratio
    // This means large payments matter more than many small ones
    let score = (successRate * 0.6 + repaymentRatio * 0.4) * 100;

    // Penalties for late payments and defaults
    score -= lateRate * 30; // Late payment reduces score by up to 30 points
    score -= defaultRate * 70; // Default reduces score by up to 70 points

    return Math.max(0, Math.min(100, score));
  }

  private calculateCreditUtilizationScore(profile: AgentCreditProfile): number {
    if (profile.unsecuredCreditLimit === 0) return 100;

    const utilization = profile.currentBalance / profile.unsecuredCreditLimit;

    // Optimal utilization: 0-10% = 100, 10-30% = 80, 30-50% = 60, 50-75% = 40, >75% = 20
    if (utilization < 0.10) return 100;
    if (utilization < 0.30) return 80;
    if (utilization < 0.50) return 60;
    if (utilization < 0.75) return 40;
    return 20;
  }

  private calculateAccountAgeScore(agentId: string): number {
    const profile = this.profiles.get(agentId);
    if (!profile) return 40;

    const ageInDays = profile.accountAge;

    // <30 days = 40, 30-90 = 60, 90-180 = 80, >180 = 100
    if (ageInDays < 30) return 40;
    if (ageInDays < 90) return 60;
    if (ageInDays < 180) return 80;
    return 100;
  }

  private calculateCreditMixScore(agentId: string): number {
    const txns = this.transactions.get(agentId) || [];

    // Variety of transaction types and amounts
    const uniqueTypes = new Set(txns.map(t => t.type)).size;
    const avgAmount = txns.length > 0
      ? txns.reduce((sum, t) => sum + t.amount, 0) / txns.length
      : 0;

    // More variety = better score
    let score = 60; // Base score
    score += uniqueTypes * 10; // Each unique type adds 10 points
    if (avgAmount > 10) score += 10; // Bonus for higher value transactions

    return Math.min(100, score);
  }

  private calculateRecentActivityScore(agentId: string): number {
    const txns = this.transactions.get(agentId) || [];
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

    const recentTxns = txns.filter(t => t.timestamp > thirtyDaysAgo);
    const recentSuccess = recentTxns.filter(t => t.status === 'completed').length;

    if (recentTxns.length === 0) return 80; // No recent activity

    const successRate = recentSuccess / recentTxns.length;
    return Math.round(successRate * 100);
  }

  // -------------------- SCORE UPDATE --------------------

  async updateCreditScore(agentId: string): Promise<AgentCreditProfile> {
    const profile = await this.getProfile(agentId);
    if (!profile) {
      throw new Error(`Profile not found for agent: ${agentId}`);
    }

    // Update all factors
    profile.factors.paymentHistory = this.calculatePaymentHistoryScore(profile);
    profile.factors.creditUtilization = this.calculateCreditUtilizationScore(profile);
    profile.factors.accountAge = this.calculateAccountAgeScore(agentId);
    profile.factors.creditMix = this.calculateCreditMixScore(agentId);
    profile.factors.recentActivity = this.calculateRecentActivityScore(agentId);

    // Calculate new score
    const oldScore = profile.creditScore;
    const calculatedScore = this.calculateCreditScore(profile);

    // Cap score increase to prevent gaming with small payments
    // Maximum increase of 15 points per payment, with bonus for large payments
    const maxIncrease = 15 + Math.min(10, Math.floor((profile.totalAmountPaid || 0) / 10));
    const cappedScore = Math.min(calculatedScore, oldScore + maxIncrease);

    // Allow decreases without cap (late payments, defaults should hurt immediately)
    const newScore = calculatedScore < oldScore ? calculatedScore : cappedScore;

    profile.creditScore = newScore;
    profile.lastScoreUpdate = Date.now();

    // Update tier with minimum payment requirements
    const oldTier = profile.creditTier;
    profile.creditTier = this.getCreditTier(newScore, profile);

    // Update limits based on tier
    const tierConfig = CREDIT_TIER_CONFIG[profile.creditTier];
    profile.unsecuredCreditLimit = tierConfig.creditLimit;
    profile.dailySpendLimit = tierConfig.creditLimit * 0.1; // 10% of credit limit
    profile.monthlySpendLimit = tierConfig.creditLimit;
    profile.tierDiscount = tierConfig.rateDiscount;

    // Update available credit
    profile.availableCredit = Math.max(0, profile.unsecuredCreditLimit - profile.currentBalance);

    // Emit events if score or tier changed
    if (newScore !== oldScore) {
      this.emit('score_updated', { agentId, oldScore, newScore, profile });
    }

    if (profile.creditTier !== oldTier) {
      this.emit('tier_changed', { agentId, oldTier, newTier: profile.creditTier, profile });
    }

    return profile;
  }

  private getCreditTier(score: number, profile?: AgentCreditProfile): CreditTier {
    // Require minimum successful payments and amounts for higher tiers
    // This prevents gaming the system with a single payment
    const payments = profile?.successfulPayments || 0;
    const totalPaid = profile?.totalAmountPaid || 0;

    // Exceptional: score >= 800, at least 10 payments, $50+ total paid
    if (score >= 800 && payments >= 10 && totalPaid >= 50) return 'exceptional';

    // Excellent: score >= 740, at least 5 payments, $20+ total paid
    if (score >= 740 && payments >= 5 && totalPaid >= 20) return 'excellent';

    // Good: score >= 670, at least 2 payments, $5+ total paid
    if (score >= 670 && payments >= 2 && totalPaid >= 5) return 'good';

    // Fair: score >= 580
    if (score >= 580) return 'fair';

    return 'subprime';
  }

  // -------------------- CREDIT TRANSACTIONS --------------------

  async recordCreditUse(
    agentId: string,
    amount: number,
    intentId?: string
  ): Promise<CreditTransaction> {
    const profile = await this.getProfile(agentId);
    if (!profile) {
      throw new Error(`Profile not found for agent: ${agentId}`);
    }

    // Check if credit available
    if (amount > profile.availableCredit) {
      throw new Error(`Insufficient credit: requested ${amount}, available ${profile.availableCredit}`);
    }

    // Check daily/monthly limits
    if (profile.currentDailySpend + amount > profile.dailySpendLimit) {
      throw new Error('Daily spending limit exceeded');
    }
    if (profile.currentMonthlySpend + amount > profile.monthlySpendLimit) {
      throw new Error('Monthly spending limit exceeded');
    }

    const txn: CreditTransaction = {
      id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      type: 'credit_used',
      amount,
      timestamp: Date.now(),
      intentId,
      status: 'pending',
    };

    // Update profile
    profile.currentBalance += amount;
    profile.currentDailySpend += amount;
    profile.currentMonthlySpend += amount;
    profile.availableCredit -= amount;
    profile.totalTransactions++;
    profile.totalAmountOwed = (profile.totalAmountOwed || 0) + amount; // Track total borrowed

    // Store transaction
    const txns = this.transactions.get(agentId) || [];
    txns.push(txn);
    this.transactions.set(agentId, txns);

    this.markDirty();
    this.emit('credit_used', { agentId, amount, txn, profile });

    return txn;
  }

  /**
   * Check anti-gaming rules for payment score impact
   */
  private checkAntiGamingRules(agentId: string, amount: number): {
    shouldImpactScore: boolean;
    reason?: string;
    scoreMultiplier: number;
  } {
    const txns = this.transactions.get(agentId) || [];
    const now = Date.now();

    // Check minimum payment amount
    if (amount < ANTI_GAMING_CONFIG.minPaymentAmount) {
      return {
        shouldImpactScore: false,
        reason: 'Payment below minimum threshold',
        scoreMultiplier: 0,
      };
    }

    // Get recent payments
    const recentPayments = txns.filter(
      t => t.type === 'payment' && t.timestamp > now - ANTI_GAMING_CONFIG.minPaymentInterval
    );

    // Check minimum interval between payments
    if (recentPayments.length > 0) {
      return {
        shouldImpactScore: false,
        reason: 'Too soon since last payment',
        scoreMultiplier: 0,
      };
    }

    // Check hourly payment limit
    const hourAgo = now - 60 * 60 * 1000;
    const paymentsLastHour = txns.filter(t => t.type === 'payment' && t.timestamp > hourAgo);
    if (paymentsLastHour.length >= ANTI_GAMING_CONFIG.maxPaymentsPerHour) {
      return {
        shouldImpactScore: false,
        reason: 'Hourly payment limit reached',
        scoreMultiplier: 0,
      };
    }

    // Check daily payment limit
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const paymentsLastDay = txns.filter(t => t.type === 'payment' && t.timestamp > dayAgo);
    if (paymentsLastDay.length >= ANTI_GAMING_CONFIG.maxPaymentsPerDay) {
      return {
        shouldImpactScore: false,
        reason: 'Daily payment limit reached',
        scoreMultiplier: 0,
      };
    }

    // Calculate score multiplier
    let scoreMultiplier = 1.0;

    // Bonus for larger payments
    if (amount >= ANTI_GAMING_CONFIG.largePaymentThreshold) {
      scoreMultiplier = 1.0 + Math.min(0.5, amount / 20); // Up to 50% bonus
    }

    // Check for rapid small payment pattern (gaming attempt)
    const last10Payments = txns.filter(t => t.type === 'payment').slice(-10);
    if (last10Payments.length >= 5) {
      const avgAmount = last10Payments.reduce((sum, t) => sum + t.amount, 0) / last10Payments.length;
      if (avgAmount < 0.10) {
        scoreMultiplier *= ANTI_GAMING_CONFIG.rapidPaymentPenalty;
      }
    }

    return { shouldImpactScore: true, scoreMultiplier };
  }

  async recordPayment(
    agentId: string,
    amount: number,
    onTime: boolean = true,
    txHash?: string,
    blockNumber?: number
  ): Promise<{ scoreImpact: number; antiGamingInfo?: string }> {
    // Auto-create profile if it doesn't exist
    let profile = await this.getProfile(agentId);
    if (!profile) {
      const address = agentId.startsWith('0x') ? agentId : `0x${agentId}`;
      profile = await this.getOrCreateProfile(agentId, address);
      console.log(`[CreditScorer] Auto-created profile for agent: ${agentId}`);
    }

    // Check anti-gaming rules
    const antiGamingResult = this.checkAntiGamingRules(agentId, amount);
    const oldScore = profile.creditScore;

    const txn: CreditTransaction = {
      id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      type: onTime ? 'payment' : 'late_payment',
      amount,
      timestamp: Date.now(),
      status: 'completed',
      txHash,
      blockNumber,
      explorerUrl: txHash ? `https://sepolia.basescan.org/tx/${txHash}` : undefined,
      scoreImpact: 0,
    };

    // Update profile - always track payment
    profile.currentBalance = Math.max(0, profile.currentBalance - amount);
    profile.availableCredit = profile.unsecuredCreditLimit - profile.currentBalance;
    profile.totalAmountPaid = (profile.totalAmountPaid || 0) + amount;

    if (onTime) {
      profile.successfulPayments++;
    } else {
      profile.latePayments++;
    }

    // Store transaction
    const txns = this.transactions.get(agentId) || [];
    txns.push(txn);
    this.transactions.set(agentId, txns);

    // Only update score if anti-gaming checks pass
    let scoreImpact = 0;
    if (antiGamingResult.shouldImpactScore) {
      await this.updateCreditScore(agentId);
      scoreImpact = profile.creditScore - oldScore;
      txn.scoreImpact = scoreImpact;
    }

    this.markDirty();
    this.emit('payment_recorded', {
      agentId,
      amount,
      onTime,
      profile,
      scoreImpact,
      antiGamingInfo: antiGamingResult.reason,
    });

    return { scoreImpact, antiGamingInfo: antiGamingResult.reason };
  }

  async recordDefault(agentId: string, amount: number): Promise<void> {
    const profile = await this.getProfile(agentId);
    if (!profile) {
      throw new Error(`Profile not found for agent: ${agentId}`);
    }

    profile.defaults++;

    const txn: CreditTransaction = {
      id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      type: 'default',
      amount,
      timestamp: Date.now(),
      status: 'failed',
    };

    const txns = this.transactions.get(agentId) || [];
    txns.push(txn);
    this.transactions.set(agentId, txns);

    // Severely impact credit score
    await this.updateCreditScore(agentId);

    this.markDirty();
    this.emit('default_recorded', { agentId, amount, profile });
  }

  // -------------------- COLLATERAL MANAGEMENT --------------------

  async addCollateral(agentId: string, amount: number): Promise<void> {
    const profile = await this.getProfile(agentId);
    if (!profile) {
      throw new Error(`Profile not found for agent: ${agentId}`);
    }

    profile.stakedAmount += amount;
    profile.collateralRatio = profile.currentBalance > 0
      ? profile.stakedAmount / profile.currentBalance
      : 0;

    // Collateral can increase credit limit
    const baseLimit = CREDIT_TIER_CONFIG[profile.creditTier].creditLimit;
    const collateralBonus = profile.stakedAmount * 0.5; // 50% of stake as bonus credit
    profile.unsecuredCreditLimit = baseLimit + collateralBonus;
    profile.availableCredit = profile.unsecuredCreditLimit - profile.currentBalance;

    this.markDirty();
    this.emit('collateral_added', { agentId, amount, profile });
  }

  async removeCollateral(agentId: string, amount: number): Promise<void> {
    const profile = await this.getProfile(agentId);
    if (!profile) {
      throw new Error(`Profile not found for agent: ${agentId}`);
    }

    if (amount > profile.stakedAmount) {
      throw new Error('Insufficient collateral');
    }

    // Can't remove collateral if it would make account undercollateralized
    const newStake = profile.stakedAmount - amount;
    const minRequiredCollateral = profile.currentBalance * 0.1; // 10% minimum

    if (newStake < minRequiredCollateral) {
      throw new Error('Cannot remove collateral: would violate minimum collateral ratio');
    }

    profile.stakedAmount -= amount;
    profile.collateralRatio = profile.currentBalance > 0
      ? profile.stakedAmount / profile.currentBalance
      : 0;

    this.markDirty();
    this.emit('collateral_removed', { agentId, amount, profile });
  }

  // -------------------- PERIODIC TASKS --------------------

  async resetDailyLimits(): Promise<void> {
    for (const profile of this.profiles.values()) {
      profile.currentDailySpend = 0;
    }
    this.markDirty();
    this.emit('daily_limits_reset');
  }

  async resetMonthlyLimits(): Promise<void> {
    for (const profile of this.profiles.values()) {
      profile.currentMonthlySpend = 0;
    }
    this.markDirty();
    this.emit('monthly_limits_reset');
  }

  async updateAccountAges(): Promise<void> {
    const now = Date.now();
    for (const profile of this.profiles.values()) {
      const txns = this.transactions.get(profile.agentId) || [];
      if (txns.length > 0) {
        const firstTxn = txns[0];
        profile.accountAge = Math.floor((now - firstTxn.timestamp) / (24 * 60 * 60 * 1000));
      }
    }
    this.markDirty();
  }

  // -------------------- STATISTICS --------------------

  getCreditStats(): {
    totalAgents: number;
    byTier: Record<CreditTier, number>;
    avgCreditScore: number;
    totalCreditExtended: number;
    totalOutstanding: number;
  } {
    const profiles = Array.from(this.profiles.values());

    return {
      totalAgents: profiles.length,
      byTier: {
        exceptional: profiles.filter(p => p.creditTier === 'exceptional').length,
        excellent: profiles.filter(p => p.creditTier === 'excellent').length,
        good: profiles.filter(p => p.creditTier === 'good').length,
        fair: profiles.filter(p => p.creditTier === 'fair').length,
        subprime: profiles.filter(p => p.creditTier === 'subprime').length,
      },
      avgCreditScore: profiles.reduce((sum, p) => sum + p.creditScore, 0) / profiles.length || 0,
      totalCreditExtended: profiles.reduce((sum, p) => sum + p.unsecuredCreditLimit, 0),
      totalOutstanding: profiles.reduce((sum, p) => sum + p.currentBalance, 0),
    };
  }
}

// -------------------- SINGLETON --------------------

let scorerInstance: AgentCreditScorer | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Get or create the credit scorer singleton
 * Automatically initializes with persistence if enabled
 */
export function getAgentCreditScorer(config?: CreditScorerConfig): AgentCreditScorer {
  if (!scorerInstance) {
    scorerInstance = new AgentCreditScorer(config);
  }
  return scorerInstance;
}

/**
 * Initialize the credit scorer singleton
 * Must be called before using the scorer if persistence is enabled
 */
export async function initializeAgentCreditScorer(config?: CreditScorerConfig): Promise<AgentCreditScorer> {
  const scorer = getAgentCreditScorer(config);

  if (!initPromise) {
    initPromise = scorer.initialize();
  }

  await initPromise;
  return scorer;
}

/**
 * Shutdown and reset the credit scorer singleton
 */
export async function resetAgentCreditScorer(): Promise<void> {
  if (scorerInstance) {
    await scorerInstance.shutdown();
  }
  scorerInstance = null;
  initPromise = null;
}
