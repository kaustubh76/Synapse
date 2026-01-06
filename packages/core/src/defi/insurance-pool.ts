/**
 * Insurance Pool Manager
 *
 * Provides insurance coverage for the agent economy:
 * - Provider failure (intent not delivered)
 * - Dispute coverage (protection during arbitration)
 * - Smart contract risk
 * - Oracle failure (bad data)
 * - Slashing protection (unfair slashing)
 *
 * Features:
 * - Premium-based policies
 * - Claims processing with evidence
 * - Staker yield from premiums
 * - Integration with dispute resolver
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  InsurancePool,
  InsurancePolicy,
  InsuranceClaim,
  InsuranceStaker,
  InsuranceRiskCategory,
  PolicyPurchaseParams,
  PolicyPurchaseResult,
  ClaimRequest,
  ClaimReviewResult,
  ClaimEvidence,
  INSURANCE_CONFIG,
} from './types.js';

export interface InsurancePoolManagerConfig {
  yieldDistributionInterval?: number; // ms
  claimReviewDelayMs?: number; // Simulated review delay
}

export class InsurancePoolManager extends EventEmitter {
  private pools: Map<string, InsurancePool> = new Map();
  private policies: Map<string, InsurancePolicy> = new Map();
  private policiesByHolder: Map<string, Set<string>> = new Map();
  private claims: Map<string, InsuranceClaim> = new Map();
  private claimsByPolicy: Map<string, Set<string>> = new Map();
  private stakers: Map<string, InsuranceStaker> = new Map();
  private stakersByPool: Map<string, Set<string>> = new Map();

  private yieldDistributionTimer?: NodeJS.Timeout;
  private claimReviewDelayMs: number;

  constructor(config: InsurancePoolManagerConfig = {}) {
    super();
    this.claimReviewDelayMs = config.claimReviewDelayMs ?? 5000; // 5 seconds for demo

    // Initialize default pools for each risk category
    this.initializeDefaultPools();

    // Start yield distribution
    const yieldInterval = config.yieldDistributionInterval ?? 3600000; // 1 hour
    this.yieldDistributionTimer = setInterval(() => {
      this.distributeYieldToStakers();
    }, yieldInterval);
  }

  private initializeDefaultPools(): void {
    const categories: InsuranceRiskCategory[] = [
      'provider_failure',
      'dispute_coverage',
      'smart_contract',
      'oracle_failure',
      'slashing_protection',
    ];

    for (const category of categories) {
      const config = INSURANCE_CONFIG[category];
      const pool: InsurancePool = {
        id: `insurance_${category}`,
        name: this.getCategoryName(category),
        description: this.getCategoryDescription(category),
        riskCategory: category,
        totalFunds: 10000, // Initial seed funding for demo
        availableFunds: 10000,
        reservedFunds: 0,
        totalCoverage: 0,
        activePolicies: 0,
        maxCoveragePerPolicy: 10000,
        coverageRatio: Infinity,
        claimCount: 0,
        totalClaimsPaid: 0,
        lossRatio: 0,
        basePremiumRate: config.basePremiumRate,
        currentPremiumRate: config.basePremiumRate,
        totalStaked: 0,
        stakerCount: 0,
        stakerAPY: 0.10, // 10% base APY for stakers
        status: 'active',
        createdAt: Date.now(),
      };

      this.pools.set(pool.id, pool);
      this.stakersByPool.set(pool.id, new Set());
    }
  }

  private getCategoryName(category: InsuranceRiskCategory): string {
    const names: Record<InsuranceRiskCategory, string> = {
      provider_failure: 'Provider Failure Insurance',
      dispute_coverage: 'Dispute Protection',
      smart_contract: 'Smart Contract Coverage',
      oracle_failure: 'Oracle Failure Insurance',
      slashing_protection: 'Slashing Protection',
    };
    return names[category];
  }

  private getCategoryDescription(category: InsuranceRiskCategory): string {
    const descriptions: Record<InsuranceRiskCategory, string> = {
      provider_failure: 'Coverage when a provider fails to deliver on an intent',
      dispute_coverage: 'Protection during dispute arbitration process',
      smart_contract: 'Coverage for smart contract vulnerabilities and exploits',
      oracle_failure: 'Protection against incorrect oracle data',
      slashing_protection: 'Coverage for unfair or erroneous slashing events',
    };
    return descriptions[category];
  }

  // ==========================================================================
  // POOL MANAGEMENT
  // ==========================================================================

  getPool(poolId: string): InsurancePool | undefined {
    return this.pools.get(poolId);
  }

  getPoolByCategory(category: InsuranceRiskCategory): InsurancePool | undefined {
    return this.pools.get(`insurance_${category}`);
  }

  getAllPools(): InsurancePool[] {
    return Array.from(this.pools.values());
  }

  getActivePools(): InsurancePool[] {
    return Array.from(this.pools.values()).filter(p => p.status === 'active');
  }

  // ==========================================================================
  // POLICY MANAGEMENT
  // ==========================================================================

  /**
   * Purchase an insurance policy
   */
  async purchasePolicy(params: PolicyPurchaseParams): Promise<PolicyPurchaseResult> {
    const pool = this.pools.get(params.poolId);
    if (!pool || pool.status !== 'active') {
      return {
        success: false,
        policyId: '',
        premium: 0,
        coverageAmount: 0,
        expiresAt: 0,
      };
    }

    // Validate coverage amount
    if (params.coverageAmount <= 0 || params.coverageAmount > pool.maxCoveragePerPolicy) {
      return {
        success: false,
        policyId: '',
        premium: 0,
        coverageAmount: 0,
        expiresAt: 0,
      };
    }

    // Check pool capacity
    const newTotalCoverage = pool.totalCoverage + params.coverageAmount;
    const maxCoverage = pool.totalFunds * INSURANCE_CONFIG[pool.riskCategory].maxCoverageRatio;
    if (newTotalCoverage > maxCoverage) {
      return {
        success: false,
        policyId: '',
        premium: 0,
        coverageAmount: 0,
        expiresAt: 0,
      };
    }

    // Calculate premium
    const durationYears = params.durationDays / 365;
    const premium = params.coverageAmount * pool.currentPremiumRate * durationYears;
    const deductible = params.coverageAmount * INSURANCE_CONFIG[pool.riskCategory].deductibleRate;

    // Create policy
    const expiresAt = Date.now() + params.durationDays * 24 * 60 * 60 * 1000;
    const policy: InsurancePolicy = {
      id: `policy_${uuidv4().slice(0, 8)}`,
      poolId: params.poolId,
      holderId: params.holderId,
      holderAddress: params.holderAddress,
      coverageAmount: params.coverageAmount,
      coverageType: pool.riskCategory,
      deductible,
      premiumRate: pool.currentPremiumRate,
      premiumPaid: premium,
      nextPremiumDue: expiresAt, // One-time payment for simplicity
      premiumInterval: params.durationDays * 24 * 60 * 60 * 1000,
      status: 'active',
      createdAt: Date.now(),
      expiresAt,
      claimCount: 0,
      totalClaimedAmount: 0,
    };

    this.policies.set(policy.id, policy);
    this.claimsByPolicy.set(policy.id, new Set());

    // Index by holder
    if (!this.policiesByHolder.has(params.holderId)) {
      this.policiesByHolder.set(params.holderId, new Set());
    }
    this.policiesByHolder.get(params.holderId)!.add(policy.id);

    // Update pool
    pool.totalCoverage += params.coverageAmount;
    pool.activePolicies += 1;
    pool.totalFunds += premium;
    pool.availableFunds += premium;
    pool.coverageRatio = pool.totalFunds / pool.totalCoverage;

    // Adjust premium rate based on utilization
    this.adjustPremiumRate(pool);

    this.emit('insurance:policy_purchased', {
      policyId: policy.id,
      poolId: params.poolId,
      holderId: params.holderId,
      coverageAmount: params.coverageAmount,
      premium,
    });

    return {
      success: true,
      policyId: policy.id,
      premium,
      coverageAmount: params.coverageAmount,
      expiresAt,
      txHash: `0x${uuidv4().replace(/-/g, '')}`,
    };
  }

  /**
   * Cancel an insurance policy
   */
  async cancelPolicy(policyId: string): Promise<{ success: boolean; refund: number }> {
    const policy = this.policies.get(policyId);
    if (!policy || policy.status !== 'active') {
      return { success: false, refund: 0 };
    }

    const pool = this.pools.get(policy.poolId);
    if (!pool) return { success: false, refund: 0 };

    // Calculate refund (pro-rata based on remaining time)
    const totalDuration = policy.expiresAt - policy.createdAt;
    const elapsed = Date.now() - policy.createdAt;
    const remainingRatio = Math.max(0, (totalDuration - elapsed) / totalDuration);
    const refund = policy.premiumPaid * remainingRatio * 0.9; // 10% cancellation fee

    // Update policy
    policy.status = 'cancelled';

    // Update pool
    pool.totalCoverage -= policy.coverageAmount;
    pool.activePolicies -= 1;
    pool.totalFunds -= refund;
    pool.availableFunds -= refund;
    if (pool.totalCoverage > 0) {
      pool.coverageRatio = pool.totalFunds / pool.totalCoverage;
    }

    this.emit('insurance:policy_cancelled', {
      policyId,
      refund,
    });

    return { success: true, refund };
  }

  getPolicy(policyId: string): InsurancePolicy | undefined {
    return this.policies.get(policyId);
  }

  getPoliciesByHolder(holderId: string): InsurancePolicy[] {
    const policyIds = this.policiesByHolder.get(holderId);
    if (!policyIds) return [];

    return Array.from(policyIds)
      .map(id => this.policies.get(id))
      .filter((p): p is InsurancePolicy => p !== undefined);
  }

  getActivePoliciesByHolder(holderId: string): InsurancePolicy[] {
    return this.getPoliciesByHolder(holderId).filter(
      p => p.status === 'active' && Date.now() < p.expiresAt
    );
  }

  // ==========================================================================
  // CLAIMS
  // ==========================================================================

  /**
   * File an insurance claim
   */
  async fileClaim(request: ClaimRequest): Promise<InsuranceClaim> {
    const policy = this.policies.get(request.policyId);
    if (!policy) {
      throw new Error('Policy not found');
    }

    if (policy.status !== 'active' || Date.now() > policy.expiresAt) {
      throw new Error('Policy is not active or has expired');
    }

    const pool = this.pools.get(policy.poolId);
    if (!pool) {
      throw new Error('Insurance pool not found');
    }

    // Validate claim amount
    const maxClaimable = policy.coverageAmount - policy.totalClaimedAmount - policy.deductible;
    if (request.amount > maxClaimable) {
      throw new Error(`Claim amount exceeds available coverage. Max claimable: $${maxClaimable.toFixed(2)}`);
    }

    // Create claim
    const claim: InsuranceClaim = {
      id: `claim_${uuidv4().slice(0, 8)}`,
      policyId: request.policyId,
      poolId: policy.poolId,
      claimantId: policy.holderId,
      claimantAddress: policy.holderAddress,
      claimAmount: request.amount,
      reason: request.reason,
      evidence: request.evidence.map((e: Omit<ClaimEvidence, 'timestamp'>) => ({
        ...e,
        timestamp: Date.now(),
      })),
      intentId: request.intentId,
      disputeId: request.disputeId,
      status: 'pending',
      filedAt: Date.now(),
    };

    this.claims.set(claim.id, claim);
    this.claimsByPolicy.get(request.policyId)!.add(claim.id);

    // Reserve funds
    pool.reservedFunds += request.amount;
    pool.availableFunds -= request.amount;

    this.emit('insurance:claim_filed', {
      claimId: claim.id,
      policyId: request.policyId,
      amount: request.amount,
      reason: request.reason,
    });

    // Auto-review after delay (simulated)
    setTimeout(() => {
      this.reviewClaim(claim.id);
    }, this.claimReviewDelayMs);

    return claim;
  }

  /**
   * Review a claim (automated for demo, would be manual/DAO in production)
   */
  async reviewClaim(claimId: string): Promise<ClaimReviewResult> {
    const claim = this.claims.get(claimId);
    if (!claim || claim.status !== 'pending') {
      return { approved: false, denialReason: 'Invalid claim', reviewNotes: '' };
    }

    claim.status = 'under_review';
    claim.reviewedAt = Date.now();

    // Simple automated review logic (would be more sophisticated in production)
    const hasEvidence = claim.evidence.length > 0;
    const hasValidReason = claim.reason.length > 10;
    const hasRelatedDispute = !!claim.disputeId;

    // Approve if has evidence and valid reason
    const approved = hasEvidence && (hasValidReason || hasRelatedDispute);
    const approvedAmount = approved ? claim.claimAmount : 0;

    const reviewNotes = approved
      ? 'Claim approved based on provided evidence'
      : 'Claim denied due to insufficient evidence';

    if (approved) {
      claim.status = 'approved';
      claim.approvedAmount = approvedAmount;
      claim.reviewNotes = reviewNotes;

      // Auto-pay approved claims
      await this.payClaim(claimId);
    } else {
      claim.status = 'denied';
      claim.denialReason = 'Insufficient evidence provided';
      claim.reviewNotes = reviewNotes;

      // Release reserved funds
      const pool = this.pools.get(claim.poolId);
      if (pool) {
        pool.reservedFunds -= claim.claimAmount;
        pool.availableFunds += claim.claimAmount;
      }
    }

    this.emit('insurance:claim_reviewed', {
      claimId,
      approved,
      approvedAmount,
      reviewNotes,
    });

    return { approved, approvedAmount, reviewNotes };
  }

  /**
   * Pay an approved claim
   */
  async payClaim(claimId: string): Promise<{ success: boolean; txHash?: string }> {
    const claim = this.claims.get(claimId);
    if (!claim || claim.status !== 'approved' || !claim.approvedAmount) {
      return { success: false };
    }

    const pool = this.pools.get(claim.poolId);
    const policy = this.policies.get(claim.policyId);
    if (!pool || !policy) {
      return { success: false };
    }

    // Update claim
    claim.status = 'paid';
    claim.paidAt = Date.now();
    claim.txHash = `0x${uuidv4().replace(/-/g, '')}`;

    // Update pool
    pool.reservedFunds -= claim.claimAmount;
    pool.totalFunds -= claim.approvedAmount;
    pool.claimCount += 1;
    pool.totalClaimsPaid += claim.approvedAmount;
    pool.lossRatio = pool.totalClaimsPaid / (pool.totalFunds + pool.totalClaimsPaid);

    // Update policy
    policy.claimCount += 1;
    policy.totalClaimedAmount += claim.approvedAmount;

    // Mark policy as claimed if coverage exhausted
    if (policy.totalClaimedAmount >= policy.coverageAmount - policy.deductible) {
      policy.status = 'claimed';
      pool.totalCoverage -= policy.coverageAmount;
      pool.activePolicies -= 1;
    }

    this.emit('insurance:claim_paid', {
      claimId,
      policyId: claim.policyId,
      amount: claim.approvedAmount,
      txHash: claim.txHash,
    });

    return { success: true, txHash: claim.txHash };
  }

  getClaim(claimId: string): InsuranceClaim | undefined {
    return this.claims.get(claimId);
  }

  getClaimsByPolicy(policyId: string): InsuranceClaim[] {
    const claimIds = this.claimsByPolicy.get(policyId);
    if (!claimIds) return [];

    return Array.from(claimIds)
      .map(id => this.claims.get(id))
      .filter((c): c is InsuranceClaim => c !== undefined);
  }

  // ==========================================================================
  // STAKING
  // ==========================================================================

  /**
   * Stake USDC in an insurance pool to earn yield
   */
  async stake(
    poolId: string,
    stakerAddress: string,
    amount: number
  ): Promise<{ success: boolean; stakerId: string; apy: number }> {
    const pool = this.pools.get(poolId);
    if (!pool || pool.status !== 'active' || amount <= 0) {
      return { success: false, stakerId: '', apy: 0 };
    }

    // Check if staker already exists
    const existingStakerId = this.findExistingStaker(poolId, stakerAddress);

    let staker: InsuranceStaker;
    if (existingStakerId) {
      staker = this.stakers.get(existingStakerId)!;
      staker.stakedAmount += amount;
    } else {
      staker = {
        id: `staker_${uuidv4().slice(0, 8)}`,
        poolId,
        stakerAddress,
        stakedAmount: amount,
        sharePercentage: 0,
        earnedYield: 0,
        claimedYield: 0,
        stakedAt: Date.now(),
        lastYieldClaim: Date.now(),
      };

      this.stakers.set(staker.id, staker);
      this.stakersByPool.get(poolId)!.add(staker.id);
    }

    // Update pool
    pool.totalStaked += amount;
    pool.totalFunds += amount;
    pool.availableFunds += amount;
    pool.stakerCount = this.stakersByPool.get(poolId)!.size;

    // Update share percentages
    this.updateStakerShares(poolId);

    this.emit('insurance:staked', {
      poolId,
      stakerId: staker.id,
      stakerAddress,
      amount,
    });

    return { success: true, stakerId: staker.id, apy: pool.stakerAPY };
  }

  /**
   * Unstake from an insurance pool
   */
  async unstake(
    stakerId: string,
    amount: number
  ): Promise<{ success: boolean; amountUnstaked: number; yieldClaimed: number }> {
    const staker = this.stakers.get(stakerId);
    if (!staker || amount <= 0) {
      return { success: false, amountUnstaked: 0, yieldClaimed: 0 };
    }

    const pool = this.pools.get(staker.poolId);
    if (!pool) {
      return { success: false, amountUnstaked: 0, yieldClaimed: 0 };
    }

    const actualAmount = Math.min(amount, staker.stakedAmount);

    // Calculate pending yield
    const pendingYield = this.calculatePendingYield(staker, pool);

    // Update staker
    staker.stakedAmount -= actualAmount;
    staker.earnedYield += pendingYield;
    staker.claimedYield += pendingYield;
    staker.lastYieldClaim = Date.now();

    // Update pool
    pool.totalStaked -= actualAmount;
    pool.totalFunds -= actualAmount + pendingYield;
    pool.availableFunds -= actualAmount + pendingYield;

    // Remove staker if fully unstaked
    if (staker.stakedAmount <= 0) {
      this.stakers.delete(stakerId);
      this.stakersByPool.get(staker.poolId)!.delete(stakerId);
      pool.stakerCount = this.stakersByPool.get(staker.poolId)!.size;
    }

    // Update share percentages
    this.updateStakerShares(staker.poolId);

    this.emit('insurance:unstaked', {
      poolId: staker.poolId,
      stakerId,
      amountUnstaked: actualAmount,
      yieldClaimed: pendingYield,
    });

    return { success: true, amountUnstaked: actualAmount, yieldClaimed: pendingYield };
  }

  private findExistingStaker(poolId: string, stakerAddress: string): string | undefined {
    const stakerIds = this.stakersByPool.get(poolId);
    if (!stakerIds) return undefined;

    for (const stakerId of stakerIds) {
      const staker = this.stakers.get(stakerId);
      if (staker && staker.stakerAddress === stakerAddress) {
        return stakerId;
      }
    }
    return undefined;
  }

  private updateStakerShares(poolId: string): void {
    const pool = this.pools.get(poolId);
    const stakerIds = this.stakersByPool.get(poolId);
    if (!pool || !stakerIds) return;

    for (const stakerId of stakerIds) {
      const staker = this.stakers.get(stakerId);
      if (staker && pool.totalStaked > 0) {
        staker.sharePercentage = staker.stakedAmount / pool.totalStaked;
      }
    }
  }

  private calculatePendingYield(staker: InsuranceStaker, pool: InsurancePool): number {
    const timeSinceLastClaim = Date.now() - staker.lastYieldClaim;
    const yearFraction = timeSinceLastClaim / (365 * 24 * 60 * 60 * 1000);
    return staker.stakedAmount * pool.stakerAPY * yearFraction;
  }

  private async distributeYieldToStakers(): Promise<void> {
    for (const pool of this.pools.values()) {
      if (pool.status !== 'active') continue;

      const stakerIds = this.stakersByPool.get(pool.id);
      if (!stakerIds) continue;

      for (const stakerId of stakerIds) {
        const staker = this.stakers.get(stakerId);
        if (!staker) continue;

        const yield_ = this.calculatePendingYield(staker, pool);
        staker.earnedYield += yield_;
        staker.lastYieldClaim = Date.now();
      }
    }
  }

  getStaker(stakerId: string): InsuranceStaker | undefined {
    return this.stakers.get(stakerId);
  }

  getStakersByPool(poolId: string): InsuranceStaker[] {
    const stakerIds = this.stakersByPool.get(poolId);
    if (!stakerIds) return [];

    return Array.from(stakerIds)
      .map(id => this.stakers.get(id))
      .filter((s): s is InsuranceStaker => s !== undefined);
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  private adjustPremiumRate(pool: InsurancePool): void {
    // Increase premium if loss ratio is high
    const lossAdjustment = pool.lossRatio * 0.5; // Up to 50% increase for 100% loss ratio

    // Increase premium if utilization is high
    const utilizationRatio = pool.totalCoverage / (pool.totalFunds * INSURANCE_CONFIG[pool.riskCategory].maxCoverageRatio);
    const utilizationAdjustment = utilizationRatio * 0.3; // Up to 30% increase

    pool.currentPremiumRate = pool.basePremiumRate * (1 + lossAdjustment + utilizationAdjustment);
  }

  /**
   * Calculate premium for a coverage amount
   */
  calculatePremium(
    poolId: string,
    coverageAmount: number,
    durationDays: number
  ): { premium: number; deductible: number } | null {
    const pool = this.pools.get(poolId);
    if (!pool) return null;

    const durationYears = durationDays / 365;
    const premium = coverageAmount * pool.currentPremiumRate * durationYears;
    const deductible = coverageAmount * INSURANCE_CONFIG[pool.riskCategory].deductibleRate;

    return { premium, deductible };
  }

  getSystemStats(): {
    totalPools: number;
    totalFunds: number;
    totalCoverage: number;
    activePolicies: number;
    totalClaimsPaid: number;
    averageLossRatio: number;
    totalStaked: number;
  } {
    let totalFunds = 0;
    let totalCoverage = 0;
    let activePolicies = 0;
    let totalClaimsPaid = 0;
    let lossRatioSum = 0;
    let totalStaked = 0;

    for (const pool of this.pools.values()) {
      totalFunds += pool.totalFunds;
      totalCoverage += pool.totalCoverage;
      activePolicies += pool.activePolicies;
      totalClaimsPaid += pool.totalClaimsPaid;
      lossRatioSum += pool.lossRatio;
      totalStaked += pool.totalStaked;
    }

    return {
      totalPools: this.pools.size,
      totalFunds,
      totalCoverage,
      activePolicies,
      totalClaimsPaid,
      averageLossRatio: this.pools.size > 0 ? lossRatioSum / this.pools.size : 0,
      totalStaked,
    };
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  destroy(): void {
    if (this.yieldDistributionTimer) {
      clearInterval(this.yieldDistributionTimer);
    }
    this.removeAllListeners();
  }
}
