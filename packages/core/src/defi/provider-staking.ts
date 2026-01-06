/**
 * Provider Staking Manager
 *
 * Manages provider staking for priority bidding and yield generation.
 *
 * Staking Tiers:
 * - Bronze ($10): 1.0x priority, 0% fee discount
 * - Silver ($100): 1.1x priority, 5% fee discount
 * - Gold ($500): 1.25x priority, 10% fee discount
 * - Platinum ($2000): 1.5x priority, 15% fee discount
 * - Diamond ($10000): 2.0x priority, 25% fee discount
 *
 * Features:
 * - Priority multiplier for bid scoring
 * - Fee discounts on platform fees
 * - Slashing for poor performance
 * - Yield from platform fees
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  ProviderStake,
  StakingTier,
  StakeResult,
  UnstakeResult,
  StakingBenefits,
  SlashResult,
  SlashEvent,
  TransactionRecord,
  STAKING_TIER_CONFIG,
  getStakingTier,
} from './types.js';

export interface ProviderStakingManagerConfig {
  yieldDistributionInterval?: number; // ms
  platformFeePool?: number; // Initial fee pool for yield
}

export class ProviderStakingManager extends EventEmitter {
  private stakes: Map<string, ProviderStake> = new Map();
  private stakesByProvider: Map<string, string> = new Map(); // providerId -> stakeId

  private platformFeePool: number = 0;
  private yieldDistributionTimer?: NodeJS.Timeout;

  // Statistics
  private totalStaked: number = 0;
  private totalSlashed: number = 0;
  private totalYieldDistributed: number = 0;

  constructor(config: ProviderStakingManagerConfig = {}) {
    super();
    this.platformFeePool = config.platformFeePool ?? 1000; // Seed with $1000

    // Start yield distribution
    const interval = config.yieldDistributionInterval ?? 3600000; // 1 hour
    this.yieldDistributionTimer = setInterval(() => {
      this.distributeYield();
    }, interval);
  }

  // ==========================================================================
  // STAKING OPERATIONS
  // ==========================================================================

  /**
   * Stake USDC as a provider
   */
  async stake(
    providerId: string,
    providerAddress: string,
    amount: number,
    lockDays: number = 0
  ): Promise<StakeResult> {
    if (amount <= 0) {
      return {
        success: false,
        stakeId: '',
        amount: 0,
        tier: 'bronze',
        benefits: this.getBenefitsForTier('bronze'),
      };
    }

    // Check if provider already has a stake
    const existingStakeId = this.stakesByProvider.get(providerId);

    let stake: ProviderStake;
    let isNew = false;

    if (existingStakeId) {
      stake = this.stakes.get(existingStakeId)!;
      stake.stakedAmount += amount;
    } else {
      isNew = true;
      stake = {
        id: `stake_${uuidv4().slice(0, 8)}`,
        providerId,
        providerAddress,
        stakedAmount: amount,
        stakingTier: 'bronze',
        priorityMultiplier: 1.0,
        feeDiscount: 0,
        maxConcurrentIntents: 5,
        slashableAmount: amount,
        totalSlashed: 0,
        slashHistory: [],
        earnedYield: 0,
        claimedYield: 0,
        stakingAPY: 0,
        status: 'active',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        transactions: [],
      };

      this.stakes.set(stake.id, stake);
      this.stakesByProvider.set(providerId, stake.id);
    }

    // Update tier and benefits
    const newTier = getStakingTier(stake.stakedAmount);
    const tierConfig = STAKING_TIER_CONFIG[newTier];

    stake.stakingTier = newTier;
    stake.priorityMultiplier = tierConfig.priorityMultiplier;
    stake.feeDiscount = tierConfig.feeDiscount;
    stake.maxConcurrentIntents = tierConfig.maxConcurrentIntents;
    stake.stakingAPY = tierConfig.baseAPY;
    stake.slashableAmount = stake.stakedAmount * (1 - tierConfig.slashProtection);
    stake.lastActivityAt = Date.now();

    // Handle lock
    if (lockDays > 0) {
      stake.lockedUntil = Date.now() + lockDays * 24 * 60 * 60 * 1000;
      // Lock bonus: up to 50% extra APY for 1 year lock
      stake.lockBonus = Math.min(lockDays / 365 * 0.5, 0.5);
      stake.stakingAPY = tierConfig.baseAPY * (1 + stake.lockBonus);
    }

    // Record transaction
    const tx: TransactionRecord = {
      txHash: `0x${uuidv4().replace(/-/g, '')}`,
      blockNumber: Math.floor(Date.now() / 1000),
      timestamp: Date.now(),
      amount,
      type: 'stake',
      from: providerAddress,
      to: 'staking_pool',
    };
    stake.transactions.push(tx);

    // Update totals
    this.totalStaked += amount;

    this.emit('staking:staked', {
      stakeId: stake.id,
      providerId,
      amount,
      tier: newTier,
      isNew,
    });

    return {
      success: true,
      stakeId: stake.id,
      amount: stake.stakedAmount,
      tier: newTier,
      benefits: this.getStakingBenefits(stake.id)!,
      txHash: tx.txHash,
    };
  }

  /**
   * Request to unstake (may have unbonding period)
   */
  async unstake(stakeId: string, amount: number): Promise<UnstakeResult> {
    const stake = this.stakes.get(stakeId);
    if (!stake || stake.status !== 'active') {
      return { success: false, amount: 0, unbondingPeriod: 0, availableAt: 0 };
    }

    // Check lock
    if (stake.lockedUntil && Date.now() < stake.lockedUntil) {
      return { success: false, amount: 0, unbondingPeriod: 0, availableAt: stake.lockedUntil };
    }

    const actualAmount = Math.min(amount, stake.stakedAmount);
    if (actualAmount <= 0) {
      return { success: false, amount: 0, unbondingPeriod: 0, availableAt: 0 };
    }

    // Calculate unbonding period based on tier
    const tierConfig = STAKING_TIER_CONFIG[stake.stakingTier];
    const unbondingPeriodMs = tierConfig.unbondingDays * 24 * 60 * 60 * 1000;
    const availableAt = Date.now() + unbondingPeriodMs;

    // Update stake
    stake.stakedAmount -= actualAmount;
    stake.status = stake.stakedAmount > 0 ? 'active' : 'unbonding';
    stake.unbondingEndsAt = availableAt;
    stake.lastActivityAt = Date.now();

    // Update tier
    if (stake.stakedAmount > 0) {
      const newTier = getStakingTier(stake.stakedAmount);
      stake.stakingTier = newTier;
      const newTierConfig = STAKING_TIER_CONFIG[newTier];
      stake.priorityMultiplier = newTierConfig.priorityMultiplier;
      stake.feeDiscount = newTierConfig.feeDiscount;
      stake.maxConcurrentIntents = newTierConfig.maxConcurrentIntents;
      stake.slashableAmount = stake.stakedAmount * (1 - newTierConfig.slashProtection);
    }

    // Record transaction
    const tx: TransactionRecord = {
      txHash: `0x${uuidv4().replace(/-/g, '')}`,
      blockNumber: Math.floor(Date.now() / 1000),
      timestamp: Date.now(),
      amount: actualAmount,
      type: 'unstake',
      from: 'staking_pool',
      to: stake.providerAddress,
    };
    stake.transactions.push(tx);

    // Update totals
    this.totalStaked -= actualAmount;

    // Remove if fully unstaked
    if (stake.stakedAmount <= 0) {
      this.stakesByProvider.delete(stake.providerId);
    }

    this.emit('staking:unstaked', {
      stakeId,
      providerId: stake.providerId,
      amount: actualAmount,
      unbondingPeriod: tierConfig.unbondingDays,
      availableAt,
    });

    return {
      success: true,
      amount: actualAmount,
      unbondingPeriod: tierConfig.unbondingDays,
      availableAt,
      txHash: tx.txHash,
    };
  }

  /**
   * Claim pending yield
   */
  async claimYield(stakeId: string): Promise<{ success: boolean; amount: number; txHash?: string }> {
    const stake = this.stakes.get(stakeId);
    if (!stake) {
      return { success: false, amount: 0 };
    }

    const pendingYield = stake.earnedYield - stake.claimedYield;
    if (pendingYield <= 0) {
      return { success: false, amount: 0 };
    }

    stake.claimedYield = stake.earnedYield;
    stake.lastActivityAt = Date.now();

    // Record transaction
    const tx: TransactionRecord = {
      txHash: `0x${uuidv4().replace(/-/g, '')}`,
      blockNumber: Math.floor(Date.now() / 1000),
      timestamp: Date.now(),
      amount: pendingYield,
      type: 'yield_claim',
      from: 'staking_pool',
      to: stake.providerAddress,
    };
    stake.transactions.push(tx);

    this.emit('staking:yield_claimed', {
      stakeId,
      providerId: stake.providerId,
      amount: pendingYield,
    });

    return { success: true, amount: pendingYield, txHash: tx.txHash };
  }

  // ==========================================================================
  // SLASHING
  // ==========================================================================

  /**
   * Slash a provider's stake for poor performance
   */
  async slash(
    stakeId: string,
    amount: number,
    reason: string,
    disputeId?: string
  ): Promise<SlashResult> {
    const stake = this.stakes.get(stakeId);
    if (!stake || stake.status !== 'active') {
      return { success: false, slashedAmount: 0, remainingStake: 0, newTier: 'bronze' };
    }

    // Apply slash protection
    const tierConfig = STAKING_TIER_CONFIG[stake.stakingTier];
    const protectedAmount = stake.stakedAmount * tierConfig.slashProtection;
    const maxSlashable = stake.stakedAmount - protectedAmount;
    const actualSlash = Math.min(amount, maxSlashable);

    if (actualSlash <= 0) {
      return {
        success: false,
        slashedAmount: 0,
        remainingStake: stake.stakedAmount,
        newTier: stake.stakingTier,
      };
    }

    // Create slash event
    const slashEvent: SlashEvent = {
      id: `slash_${uuidv4().slice(0, 8)}`,
      stakeId,
      amount: actualSlash,
      reason,
      disputeId,
      timestamp: Date.now(),
      txHash: `0x${uuidv4().replace(/-/g, '')}`,
    };

    // Update stake
    stake.stakedAmount -= actualSlash;
    stake.totalSlashed += actualSlash;
    stake.slashableAmount = Math.max(0, stake.stakedAmount - (stake.stakedAmount * tierConfig.slashProtection));
    stake.slashHistory.push(slashEvent);
    stake.lastActivityAt = Date.now();

    // Update tier
    const newTier = getStakingTier(stake.stakedAmount);
    stake.stakingTier = newTier;
    const newTierConfig = STAKING_TIER_CONFIG[newTier];
    stake.priorityMultiplier = newTierConfig.priorityMultiplier;
    stake.feeDiscount = newTierConfig.feeDiscount;
    stake.maxConcurrentIntents = newTierConfig.maxConcurrentIntents;

    // Check if fully slashed
    if (stake.stakedAmount <= 0) {
      stake.status = 'slashed';
      this.stakesByProvider.delete(stake.providerId);
    }

    // Record transaction
    const tx: TransactionRecord = {
      txHash: slashEvent.txHash!,
      blockNumber: Math.floor(Date.now() / 1000),
      timestamp: Date.now(),
      amount: actualSlash,
      type: 'slash',
      from: stake.providerAddress,
      to: 'platform',
    };
    stake.transactions.push(tx);

    // Update totals
    this.totalStaked -= actualSlash;
    this.totalSlashed += actualSlash;

    // Add slashed amount to fee pool for redistribution
    this.platformFeePool += actualSlash;

    this.emit('staking:slashed', {
      stakeId,
      providerId: stake.providerId,
      amount: actualSlash,
      reason,
      disputeId,
      newTier,
    });

    return {
      success: true,
      slashedAmount: actualSlash,
      remainingStake: stake.stakedAmount,
      newTier,
      txHash: slashEvent.txHash,
    };
  }

  // ==========================================================================
  // YIELD DISTRIBUTION
  // ==========================================================================

  /**
   * Distribute yield from platform fee pool to stakers
   */
  async distributeYield(): Promise<void> {
    if (this.totalStaked <= 0 || this.platformFeePool <= 0) return;

    // Distribute 50% of fee pool as yield
    const yieldToDistribute = this.platformFeePool * 0.5;
    this.platformFeePool -= yieldToDistribute;

    for (const stake of this.stakes.values()) {
      if (stake.status !== 'active') continue;

      const shareRatio = stake.stakedAmount / this.totalStaked;
      let stakeYield = yieldToDistribute * shareRatio;

      // Apply APY bonus for locks
      if (stake.lockBonus && stake.lockedUntil && Date.now() < stake.lockedUntil) {
        stakeYield *= (1 + stake.lockBonus);
      }

      stake.earnedYield += stakeYield;
    }

    this.totalYieldDistributed += yieldToDistribute;

    this.emit('staking:yield_distributed', {
      amount: yieldToDistribute,
      timestamp: Date.now(),
    });
  }

  /**
   * Add fees to the platform fee pool (called by payment system)
   */
  addToFeePool(amount: number): void {
    this.platformFeePool += amount;
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  getStake(stakeId: string): ProviderStake | undefined {
    return this.stakes.get(stakeId);
  }

  getStakeByProvider(providerId: string): ProviderStake | undefined {
    const stakeId = this.stakesByProvider.get(providerId);
    if (!stakeId) return undefined;
    return this.stakes.get(stakeId);
  }

  getStakingBenefits(stakeId: string): StakingBenefits | undefined {
    const stake = this.stakes.get(stakeId);
    if (!stake) return undefined;

    return {
      tier: stake.stakingTier,
      priorityMultiplier: stake.priorityMultiplier,
      feeDiscount: stake.feeDiscount,
      maxConcurrentIntents: stake.maxConcurrentIntents,
      slashProtection: STAKING_TIER_CONFIG[stake.stakingTier].slashProtection,
      stakingAPY: stake.stakingAPY,
    };
  }

  getBenefitsForTier(tier: StakingTier): StakingBenefits {
    const config = STAKING_TIER_CONFIG[tier];
    return {
      tier,
      priorityMultiplier: config.priorityMultiplier,
      feeDiscount: config.feeDiscount,
      maxConcurrentIntents: config.maxConcurrentIntents,
      slashProtection: config.slashProtection,
      stakingAPY: config.baseAPY,
    };
  }

  /**
   * Get priority multiplier for a provider (used in bid scoring)
   */
  getPriorityMultiplier(providerId: string): number {
    const stake = this.getStakeByProvider(providerId);
    return stake?.priorityMultiplier ?? 1.0;
  }

  /**
   * Get fee discount for a provider
   */
  getFeeDiscount(providerId: string): number {
    const stake = this.getStakeByProvider(providerId);
    return stake?.feeDiscount ?? 0;
  }

  getAllStakes(): ProviderStake[] {
    return Array.from(this.stakes.values());
  }

  getActiveStakes(): ProviderStake[] {
    return Array.from(this.stakes.values()).filter(s => s.status === 'active');
  }

  getTierConfig(): typeof STAKING_TIER_CONFIG {
    return STAKING_TIER_CONFIG;
  }

  getStats(): {
    totalStaked: number;
    totalSlashed: number;
    totalYieldDistributed: number;
    platformFeePool: number;
    activeStakers: number;
    tierDistribution: Record<StakingTier, number>;
  } {
    const tierDistribution: Record<StakingTier, number> = {
      bronze: 0,
      silver: 0,
      gold: 0,
      platinum: 0,
      diamond: 0,
    };

    let activeStakers = 0;
    for (const stake of this.stakes.values()) {
      if (stake.status === 'active') {
        activeStakers++;
        tierDistribution[stake.stakingTier]++;
      }
    }

    return {
      totalStaked: this.totalStaked,
      totalSlashed: this.totalSlashed,
      totalYieldDistributed: this.totalYieldDistributed,
      platformFeePool: this.platformFeePool,
      activeStakers,
      tierDistribution,
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
