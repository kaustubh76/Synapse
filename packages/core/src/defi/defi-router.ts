/**
 * DeFi Router
 *
 * Unified entry point for all DeFi operations.
 * Coordinates between all DeFi managers and provides
 * a single interface for the API layer.
 */

import { EventEmitter } from 'events';
import { LiquidityPoolManager } from './liquidity-pool.js';
import { CreditLendingManager } from './credit-lending.js';
import { FlashLoanManager } from './flash-loans.js';
import { InsurancePoolManager } from './insurance-pool.js';
import { ProviderStakingManager } from './provider-staking.js';
import { YieldStrategyManager } from './yield-strategies.js';
import {
  DeFiPortfolio,
  DeFiSystemStats,
  CreditTier,
  StakingTier,
  YieldStrategyType,
  InsuranceRiskCategory,
  DEFI_CREDIT_TIER_CONFIG,
  STAKING_TIER_CONFIG,
  YIELD_STRATEGY_PRESETS,
  INSURANCE_CONFIG,
} from './types.js';

export interface DeFiRouterConfig {
  enableRealTransfers?: boolean;
  platformWalletAddress?: string;
  platformPrivateKey?: string;
  rpcUrl?: string;
}

export class DeFiRouter extends EventEmitter {
  public readonly liquidityPool: LiquidityPoolManager;
  public readonly creditLending: CreditLendingManager;
  public readonly flashLoans: FlashLoanManager;
  public readonly insurance: InsurancePoolManager;
  public readonly providerStaking: ProviderStakingManager;
  public readonly yieldStrategies: YieldStrategyManager;

  private config: DeFiRouterConfig;

  constructor(config: DeFiRouterConfig = {}) {
    super();
    this.config = config;

    // Initialize managers in dependency order
    this.liquidityPool = new LiquidityPoolManager({
      enableRealTransfers: config.enableRealTransfers,
      platformWalletAddress: config.platformWalletAddress,
      platformPrivateKey: config.platformPrivateKey,
      rpcUrl: config.rpcUrl,
    });

    this.creditLending = new CreditLendingManager({
      liquidityPoolManager: this.liquidityPool,
      enableRealTransfers: config.enableRealTransfers,
      platformWalletAddress: config.platformWalletAddress,
      platformPrivateKey: config.platformPrivateKey,
      rpcUrl: config.rpcUrl,
    });

    this.flashLoans = new FlashLoanManager({
      liquidityPoolManager: this.liquidityPool,
    });

    this.insurance = new InsurancePoolManager();

    this.providerStaking = new ProviderStakingManager();

    this.yieldStrategies = new YieldStrategyManager({
      liquidityPoolManager: this.liquidityPool,
      creditLendingManager: this.creditLending,
      insurancePoolManager: this.insurance,
      providerStakingManager: this.providerStaking,
    });

    // Forward events from all managers
    this.setupEventForwarding();
  }

  private setupEventForwarding(): void {
    const forwardEvents = (manager: EventEmitter, prefix: string) => {
      const originalEmit = manager.emit.bind(manager);
      manager.emit = (event: string, ...args: unknown[]) => {
        const result = originalEmit(event, ...args);
        this.emit(`${prefix}:${event}`, ...args);
        this.emit('defi:event', { type: `${prefix}:${event}`, data: args[0] });
        return result;
      };
    };

    forwardEvents(this.liquidityPool, 'pool');
    forwardEvents(this.creditLending, 'credit');
    forwardEvents(this.flashLoans, 'flash');
    forwardEvents(this.insurance, 'insurance');
    forwardEvents(this.providerStaking, 'staking');
    forwardEvents(this.yieldStrategies, 'strategy');
  }

  // ==========================================================================
  // PORTFOLIO
  // ==========================================================================

  /**
   * Get full DeFi portfolio for an agent
   */
  getPortfolio(agentId: string, agentAddress: string): DeFiPortfolio {
    // Collect all positions
    const liquidityPositions = this.liquidityPool.getPositionsByAgent(agentId);
    const creditLine = this.creditLending.getCreditLineByAgent(agentId);
    const insurancePolicies = this.insurance.getActivePoliciesByHolder(agentId);
    const stakingPosition = this.providerStaking.getStakeByProvider(agentId);
    const strategyPositions = this.yieldStrategies.getPositionsByAgent(agentId);

    // Calculate totals
    let totalValue = 0;
    let totalDeposited = 0;
    let totalEarned = 0;
    let totalBorrowed = 0;

    // Liquidity positions
    for (const pos of liquidityPositions) {
      totalValue += pos.currentValue;
      totalDeposited += pos.depositedAmount;
      totalEarned += pos.earnedYield;
    }

    // Credit line
    if (creditLine) {
      totalBorrowed += creditLine.outstandingBalance;
    }

    // Staking
    if (stakingPosition) {
      totalValue += stakingPosition.stakedAmount;
      totalDeposited += stakingPosition.stakedAmount;
      totalEarned += stakingPosition.earnedYield;
    }

    // Strategy positions
    for (const pos of strategyPositions) {
      totalValue += pos.currentValue;
      totalDeposited += pos.depositedAmount;
      totalEarned += pos.earnedYield;
    }

    // Calculate metrics
    const netAPY = totalDeposited > 0 ? (totalEarned / totalDeposited) * 12 : 0; // Annualized
    const healthScore = this.calculateHealthScore(agentId);
    const riskExposure = this.calculateRiskExposure(agentId);

    return {
      agentId,
      agentAddress,
      totalValue,
      totalDeposited,
      totalEarned,
      totalBorrowed,
      liquidityPositions,
      creditLines: creditLine ? [creditLine] : [],
      insurancePolicies,
      stakingPositions: stakingPosition ? [stakingPosition] : [],
      strategyPositions,
      netAPY,
      healthScore,
      riskExposure,
      lastUpdated: Date.now(),
    };
  }

  private calculateHealthScore(agentId: string): number {
    let score = 100;

    // Check credit line health
    const creditLine = this.creditLending.getCreditLineByAgent(agentId);
    if (creditLine) {
      if (creditLine.healthFactor < 1.5) score -= 20;
      if (creditLine.healthFactor < 1.2) score -= 30;
      if (creditLine.outstandingBalance > creditLine.creditLimit * 0.8) score -= 10;
    }

    // Check staking status
    const stake = this.providerStaking.getStakeByProvider(agentId);
    if (stake && stake.slashHistory.length > 0) {
      score -= stake.slashHistory.length * 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  private calculateRiskExposure(agentId: string): number {
    let riskScore = 0;

    // Credit exposure
    const creditLine = this.creditLending.getCreditLineByAgent(agentId);
    if (creditLine && creditLine.outstandingBalance > 0) {
      riskScore += (creditLine.outstandingBalance / creditLine.creditLimit) * 30;
    }

    // Strategy risk
    const strategyPositions = this.yieldStrategies.getPositionsByAgent(agentId);
    for (const pos of strategyPositions) {
      const strategy = this.yieldStrategies.getStrategy(pos.strategyId);
      if (strategy) {
        const positionRisk = (pos.currentValue / 10000) * strategy.riskLevel;
        riskScore += positionRisk;
      }
    }

    return Math.min(100, riskScore);
  }

  // ==========================================================================
  // SYSTEM STATS
  // ==========================================================================

  /**
   * Get system-wide DeFi statistics
   */
  getSystemStats(): DeFiSystemStats {
    const poolStats = this.liquidityPool.getSystemStats();
    const creditStats = this.creditLending.getSystemStats();
    const flashStats = this.flashLoans.getStats();
    const insuranceStats = this.insurance.getSystemStats();
    const stakingStats = this.providerStaking.getStats();
    const strategyStats = this.yieldStrategies.getStats();

    // Calculate TVL
    const totalValueLocked =
      poolStats.totalTVL +
      stakingStats.totalStaked +
      insuranceStats.totalFunds +
      strategyStats.totalTVL;

    return {
      // TVL
      totalValueLocked,
      liquidityPoolTVL: poolStats.totalTVL,
      stakingTVL: stakingStats.totalStaked,
      insuranceTVL: insuranceStats.totalFunds,
      strategyTVL: strategyStats.totalTVL,

      // Activity
      totalDeposits: poolStats.totalTVL + strategyStats.totalTVL,
      totalWithdrawals: 0, // Would track separately
      totalBorrows: creditStats.totalOutstanding,
      totalRepayments: 0, // Would track separately

      // Yields
      averageAPY: (poolStats.averageAPY + strategyStats.averageAPY) / 2,
      totalYieldDistributed: poolStats.totalYieldDistributed + strategyStats.totalYieldGenerated,

      // Lending
      totalOutstandingLoans: creditStats.totalOutstanding,
      averageInterestRate: 0.12, // Average across tiers
      defaultRate: creditStats.defaultRate,

      // Flash loans
      totalFlashLoans: flashStats.totalFlashLoans,
      flashLoanVolume: flashStats.totalVolume,
      flashLoanFees: flashStats.totalFees,

      // Insurance
      totalCoverage: insuranceStats.totalCoverage,
      totalPremiums: insuranceStats.totalFunds - insuranceStats.totalStaked,
      totalClaimsPaid: insuranceStats.totalClaimsPaid,

      // Users
      uniqueDepositors: poolStats.totalDepositors,
      uniqueBorrowers: creditStats.activeCreditLines,
      uniqueStakers: stakingStats.activeStakers,

      lastUpdated: Date.now(),
    };
  }

  // ==========================================================================
  // CONFIGURATION GETTERS
  // ==========================================================================

  getCreditTierConfig(): typeof DEFI_CREDIT_TIER_CONFIG {
    return DEFI_CREDIT_TIER_CONFIG;
  }

  getStakingTierConfig(): typeof STAKING_TIER_CONFIG {
    return STAKING_TIER_CONFIG;
  }

  getYieldStrategyPresets(): typeof YIELD_STRATEGY_PRESETS {
    return YIELD_STRATEGY_PRESETS;
  }

  getInsuranceConfig(): typeof INSURANCE_CONFIG {
    return INSURANCE_CONFIG;
  }

  // ==========================================================================
  // QUICK ACTIONS
  // ==========================================================================

  /**
   * Quick deposit to main liquidity pool
   */
  async quickDeposit(agentId: string, agentAddress: string, amount: number) {
    return this.liquidityPool.deposit('main_pool', agentId, agentAddress, amount);
  }

  /**
   * Quick borrow against credit line
   */
  async quickBorrow(agentId: string, amount: number, purpose?: string) {
    const creditLine = this.creditLending.getCreditLineByAgent(agentId);
    if (!creditLine) {
      return { success: false, error: 'No credit line found' };
    }
    return this.creditLending.borrow(creditLine.id, amount, purpose);
  }

  /**
   * Quick stake as provider
   */
  async quickStake(providerId: string, providerAddress: string, amount: number) {
    return this.providerStaking.stake(providerId, providerAddress, amount);
  }

  /**
   * Quick deposit to yield strategy
   */
  async quickStrategyDeposit(
    agentId: string,
    agentAddress: string,
    strategyType: YieldStrategyType,
    amount: number
  ) {
    return this.yieldStrategies.deposit(`strategy_${strategyType}`, agentId, agentAddress, amount);
  }

  /**
   * Quick purchase insurance
   */
  async quickInsure(
    holderId: string,
    holderAddress: string,
    riskCategory: InsuranceRiskCategory,
    coverageAmount: number,
    durationDays: number = 30
  ) {
    return this.insurance.purchasePolicy({
      poolId: `insurance_${riskCategory}`,
      holderId,
      holderAddress,
      coverageAmount,
      durationDays,
    });
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  destroy(): void {
    this.liquidityPool.destroy();
    this.creditLending.destroy();
    this.flashLoans.destroy();
    this.insurance.destroy();
    this.providerStaking.destroy();
    this.yieldStrategies.destroy();
    this.removeAllListeners();
  }
}
