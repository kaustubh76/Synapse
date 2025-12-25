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

export interface CreditTransaction {
  id: string;
  agentId: string;
  type: 'credit_used' | 'payment' | 'late_payment' | 'default';
  amount: number;
  timestamp: number;
  intentId?: string;
  status: 'pending' | 'completed' | 'failed';
}

export class AgentCreditScorer extends EventEmitter {
  private profiles: Map<string, AgentCreditProfile> = new Map();
  private transactions: Map<string, CreditTransaction[]> = new Map();

  // -------------------- PROFILE MANAGEMENT --------------------

  async getOrCreateProfile(agentId: string, address: string): Promise<AgentCreditProfile> {
    if (this.profiles.has(agentId)) {
      return this.profiles.get(agentId)!;
    }

    // Create new profile with default score
    const profile: AgentCreditProfile = {
      agentId,
      address,
      creditScore: 650, // Start at 'good' tier
      creditTier: 'good',
      lastScoreUpdate: Date.now(),
      unsecuredCreditLimit: 1000, // $1000 starting limit
      dailySpendLimit: 100,
      monthlySpendLimit: 1000,
      currentDailySpend: 0,
      currentMonthlySpend: 0,
      currentBalance: 0,
      availableCredit: 1000,
      totalTransactions: 0,
      successfulPayments: 0,
      latePayments: 0,
      defaults: 0,
      accountAge: 0,
      factors: {
        paymentHistory: 100,
        creditUtilization: 100,
        accountAge: 40,
        creditMix: 60,
        recentActivity: 80,
      },
      stakedAmount: 0,
      collateralRatio: 0,
      tierDiscount: CREDIT_TIER_CONFIG.good.rateDiscount,
    };

    this.profiles.set(agentId, profile);
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
    if (profile.totalTransactions === 0) return 100;

    const successRate = profile.successfulPayments / profile.totalTransactions;
    const lateRate = profile.latePayments / profile.totalTransactions;
    const defaultRate = profile.defaults / profile.totalTransactions;

    // Perfect payment = 100, late payments hurt, defaults hurt more
    let score = 100;
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
    const newScore = this.calculateCreditScore(profile);

    profile.creditScore = newScore;
    profile.lastScoreUpdate = Date.now();

    // Update tier
    const oldTier = profile.creditTier;
    profile.creditTier = this.getCreditTier(newScore);

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

  private getCreditTier(score: number): CreditTier {
    if (score >= 800) return 'exceptional';
    if (score >= 740) return 'excellent';
    if (score >= 670) return 'good';
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

    // Store transaction
    const txns = this.transactions.get(agentId) || [];
    txns.push(txn);
    this.transactions.set(agentId, txns);

    this.emit('credit_used', { agentId, amount, txn, profile });

    return txn;
  }

  async recordPayment(
    agentId: string,
    amount: number,
    onTime: boolean = true
  ): Promise<void> {
    const profile = await this.getProfile(agentId);
    if (!profile) {
      throw new Error(`Profile not found for agent: ${agentId}`);
    }

    const txn: CreditTransaction = {
      id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      type: onTime ? 'payment' : 'late_payment',
      amount,
      timestamp: Date.now(),
      status: 'completed',
    };

    // Update profile
    profile.currentBalance = Math.max(0, profile.currentBalance - amount);
    profile.availableCredit = profile.unsecuredCreditLimit - profile.currentBalance;

    if (onTime) {
      profile.successfulPayments++;
    } else {
      profile.latePayments++;
    }

    // Store transaction
    const txns = this.transactions.get(agentId) || [];
    txns.push(txn);
    this.transactions.set(agentId, txns);

    // Update credit score
    await this.updateCreditScore(agentId);

    this.emit('payment_recorded', { agentId, amount, onTime, profile });
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

    this.emit('collateral_removed', { agentId, amount, profile });
  }

  // -------------------- PERIODIC TASKS --------------------

  async resetDailyLimits(): Promise<void> {
    for (const profile of this.profiles.values()) {
      profile.currentDailySpend = 0;
    }
    this.emit('daily_limits_reset');
  }

  async resetMonthlyLimits(): Promise<void> {
    for (const profile of this.profiles.values()) {
      profile.currentMonthlySpend = 0;
    }
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

export function getAgentCreditScorer(): AgentCreditScorer {
  if (!scorerInstance) {
    scorerInstance = new AgentCreditScorer();
  }
  return scorerInstance;
}

export function resetAgentCreditScorer(): void {
  scorerInstance = null;
}
