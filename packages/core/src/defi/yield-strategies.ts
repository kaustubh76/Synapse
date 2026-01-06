/**
 * Yield Strategy Manager
 *
 * Provides automated yield optimization strategies for agents.
 *
 * Strategies:
 * - Conservative (5% APY): 40% reserve, minimal risk
 * - Balanced (12% APY): Mixed allocation, moderate risk
 * - Aggressive (25% APY): High credit lending, higher risk
 *
 * Features:
 * - Auto-rebalancing
 * - Auto-compound or manual harvest
 * - Lock period bonuses
 * - Performance tracking
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  DeFiYieldStrategy,
  YieldStrategyType,
  DeFiYieldAllocation,
  StrategyPosition,
  StrategyReturn,
  StrategyDepositResult,
  StrategyWithdrawResult,
  HarvestResult,
  RebalanceResult,
  TransactionRecord,
  YIELD_STRATEGY_PRESETS,
} from './types.js';
import { LiquidityPoolManager } from './liquidity-pool.js';
import { CreditLendingManager } from './credit-lending.js';
import { InsurancePoolManager } from './insurance-pool.js';
import { ProviderStakingManager } from './provider-staking.js';

export interface YieldStrategyManagerConfig {
  liquidityPoolManager?: LiquidityPoolManager;
  creditLendingManager?: CreditLendingManager;
  insurancePoolManager?: InsurancePoolManager;
  providerStakingManager?: ProviderStakingManager;
  rebalanceInterval?: number; // ms
  yieldCalculationInterval?: number; // ms
}

export class YieldStrategyManager extends EventEmitter {
  private strategies: Map<string, DeFiYieldStrategy> = new Map();
  private positions: Map<string, StrategyPosition> = new Map();
  private positionsByAgent: Map<string, Set<string>> = new Map();
  private positionsByStrategy: Map<string, Set<string>> = new Map();

  // Connected managers (optional, for actual allocation)
  private liquidityPool?: LiquidityPoolManager;
  private creditLending?: CreditLendingManager;
  private insurancePool?: InsurancePoolManager;
  private providerStaking?: ProviderStakingManager;

  private rebalanceTimer?: NodeJS.Timeout;
  private yieldTimer?: NodeJS.Timeout;

  constructor(config: YieldStrategyManagerConfig = {}) {
    super();

    this.liquidityPool = config.liquidityPoolManager;
    this.creditLending = config.creditLendingManager;
    this.insurancePool = config.insurancePoolManager;
    this.providerStaking = config.providerStakingManager;

    // Initialize default strategies
    this.initializeStrategies();

    // Start rebalancing timer
    const rebalanceInterval = config.rebalanceInterval ?? 86400000; // 24 hours
    this.rebalanceTimer = setInterval(() => {
      this.rebalanceAllStrategies();
    }, rebalanceInterval);

    // Start yield calculation timer
    const yieldInterval = config.yieldCalculationInterval ?? 3600000; // 1 hour
    this.yieldTimer = setInterval(() => {
      this.calculateAndDistributeYield();
    }, yieldInterval);
  }

  private initializeStrategies(): void {
    const types: YieldStrategyType[] = ['conservative', 'balanced', 'aggressive'];

    for (const type of types) {
      const preset = YIELD_STRATEGY_PRESETS[type];
      const strategy: DeFiYieldStrategy = {
        id: `strategy_${type}`,
        name: this.getStrategyName(type),
        description: this.getStrategyDescription(type),
        type,
        allocation: preset.allocation,
        expectedAPY: preset.expectedAPY,
        currentAPY: preset.expectedAPY,
        historicalAPY: preset.expectedAPY,
        riskLevel: preset.riskLevel,
        volatility: 0.05 + (preset.riskLevel / 10) * 0.15, // 5-20% volatility
        maxDrawdown: preset.riskLevel * 0.02, // 2-16% max drawdown
        minDeposit: type === 'conservative' ? 0.01 : type === 'balanced' ? 0.05 : 0.1,
        maxCapacity: 1000000, // $1M per strategy
        currentCapacity: 0,
        lockPeriod: preset.lockPeriod,
        managementFee: preset.managementFee,
        performanceFee: preset.performanceFee,
        status: 'active',
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalYieldGenerated: 0,
        historicalReturns: [],
        createdAt: Date.now(),
        lastRebalance: Date.now(),
      };

      this.strategies.set(strategy.id, strategy);
      this.positionsByStrategy.set(strategy.id, new Set());
    }
  }

  private getStrategyName(type: YieldStrategyType): string {
    const names: Record<YieldStrategyType, string> = {
      conservative: 'Conservative Yield',
      balanced: 'Balanced Growth',
      aggressive: 'Aggressive Alpha',
    };
    return names[type];
  }

  private getStrategyDescription(type: YieldStrategyType): string {
    const descriptions: Record<YieldStrategyType, string> = {
      conservative: 'Low-risk strategy with 40% reserve. Ideal for capital preservation with steady returns.',
      balanced: 'Moderate risk with diversified allocation. Good balance of growth and stability.',
      aggressive: 'High-risk, high-reward strategy. Maximizes yield through credit lending exposure.',
    };
    return descriptions[type];
  }

  // ==========================================================================
  // DEPOSIT & WITHDRAW
  // ==========================================================================

  /**
   * Deposit into a yield strategy
   */
  async deposit(
    strategyId: string,
    agentId: string,
    agentAddress: string,
    amount: number
  ): Promise<StrategyDepositResult> {
    const strategy = this.strategies.get(strategyId);
    if (!strategy || strategy.status !== 'active') {
      return { success: false, positionId: '', shares: 0, depositedAmount: 0 };
    }

    // Validate amount
    if (amount < strategy.minDeposit) {
      return { success: false, positionId: '', shares: 0, depositedAmount: 0 };
    }

    // Check capacity
    if (strategy.currentCapacity + amount > strategy.maxCapacity) {
      return { success: false, positionId: '', shares: 0, depositedAmount: 0 };
    }

    // Calculate shares (1:1 initially, then based on NAV)
    const totalShares = this.getTotalShares(strategyId);
    const nav = strategy.currentCapacity > 0 ? strategy.currentCapacity : 1;
    const shares = totalShares > 0
      ? (amount / nav) * totalShares
      : amount;

    // Check if agent already has a position
    const existingPositionId = this.findExistingPosition(strategyId, agentId);

    let position: StrategyPosition;
    if (existingPositionId) {
      position = this.positions.get(existingPositionId)!;
      position.shares += shares;
      position.depositedAmount += amount;
      position.currentValue = this.calculatePositionValue(position, strategy);
    } else {
      position = {
        id: `position_${uuidv4().slice(0, 8)}`,
        strategyId,
        agentId,
        agentAddress,
        depositedAmount: amount,
        currentValue: amount,
        shares,
        earnedYield: 0,
        claimedYield: 0,
        pendingYield: 0,
        autoCompound: true,
        lockedUntil: strategy.lockPeriod > 0 ? Date.now() + strategy.lockPeriod : undefined,
        earlyWithdrawalPenalty: strategy.lockPeriod > 0 ? 0.05 : undefined, // 5% penalty
        depositedAt: Date.now(),
        lastHarvest: Date.now(),
        transactions: [],
      };

      this.positions.set(position.id, position);

      // Index by agent
      if (!this.positionsByAgent.has(agentId)) {
        this.positionsByAgent.set(agentId, new Set());
      }
      this.positionsByAgent.get(agentId)!.add(position.id);

      // Index by strategy
      this.positionsByStrategy.get(strategyId)!.add(position.id);
    }

    // Deduct management fee
    const managementFee = amount * strategy.managementFee;
    const netDeposit = amount - managementFee;

    // Record transaction
    const tx: TransactionRecord = {
      txHash: `0x${uuidv4().replace(/-/g, '')}`,
      blockNumber: Math.floor(Date.now() / 1000),
      timestamp: Date.now(),
      amount: netDeposit,
      type: 'strategy_deposit',
      from: agentAddress,
      to: strategyId,
    };
    position.transactions.push(tx);

    // Update strategy
    strategy.currentCapacity += netDeposit;
    strategy.totalDeposits += netDeposit;

    // Allocate funds according to strategy
    await this.allocateFunds(strategy, netDeposit);

    this.emit('strategy:deposited', {
      strategyId,
      positionId: position.id,
      agentId,
      amount: netDeposit,
      shares,
    });

    return {
      success: true,
      positionId: position.id,
      shares,
      depositedAmount: netDeposit,
      lockedUntil: position.lockedUntil,
      txHash: tx.txHash,
    };
  }

  /**
   * Withdraw from a yield strategy
   */
  async withdraw(
    positionId: string,
    sharesToWithdraw: number
  ): Promise<StrategyWithdrawResult> {
    const position = this.positions.get(positionId);
    if (!position) {
      return { success: false, sharesBurned: 0, amountReceived: 0, yieldClaimed: 0 };
    }

    const strategy = this.strategies.get(position.strategyId);
    if (!strategy) {
      return { success: false, sharesBurned: 0, amountReceived: 0, yieldClaimed: 0 };
    }

    // Check lock
    let penalty = 0;
    if (position.lockedUntil && Date.now() < position.lockedUntil && position.earlyWithdrawalPenalty) {
      penalty = position.earlyWithdrawalPenalty;
    }

    // Calculate withdrawal amount
    const actualShares = Math.min(sharesToWithdraw, position.shares);
    if (actualShares <= 0) {
      return { success: false, sharesBurned: 0, amountReceived: 0, yieldClaimed: 0 };
    }

    const shareRatio = actualShares / position.shares;
    const positionValue = this.calculatePositionValue(position, strategy);
    const withdrawAmount = positionValue * shareRatio;

    // Apply penalty if early withdrawal
    const penaltyAmount = withdrawAmount * penalty;
    const netWithdraw = withdrawAmount - penaltyAmount;

    // Calculate yield portion
    const yieldClaimed = position.pendingYield * shareRatio;

    // Update position
    position.shares -= actualShares;
    position.depositedAmount *= (1 - shareRatio);
    position.currentValue = this.calculatePositionValue(position, strategy);
    position.pendingYield -= yieldClaimed;
    position.claimedYield += yieldClaimed;

    // Record transaction
    const tx: TransactionRecord = {
      txHash: `0x${uuidv4().replace(/-/g, '')}`,
      blockNumber: Math.floor(Date.now() / 1000),
      timestamp: Date.now(),
      amount: netWithdraw,
      type: 'strategy_withdraw',
      from: position.strategyId,
      to: position.agentAddress,
    };
    position.transactions.push(tx);

    // Update strategy
    strategy.currentCapacity -= withdrawAmount;
    strategy.totalWithdrawals += withdrawAmount;

    // Remove position if fully withdrawn
    if (position.shares <= 0) {
      this.positions.delete(positionId);
      this.positionsByAgent.get(position.agentId)?.delete(positionId);
      this.positionsByStrategy.get(position.strategyId)?.delete(positionId);
    }

    this.emit('strategy:withdrawn', {
      strategyId: strategy.id,
      positionId,
      agentId: position.agentId,
      shares: actualShares,
      amount: netWithdraw,
      penalty: penaltyAmount,
    });

    return {
      success: true,
      sharesBurned: actualShares,
      amountReceived: netWithdraw,
      yieldClaimed,
      penalty: penaltyAmount,
      txHash: tx.txHash,
    };
  }

  // ==========================================================================
  // YIELD MANAGEMENT
  // ==========================================================================

  /**
   * Harvest yield from a position
   */
  async harvest(positionId: string): Promise<HarvestResult> {
    const position = this.positions.get(positionId);
    if (!position || position.pendingYield <= 0) {
      return { success: false, amountHarvested: 0, compounded: false };
    }

    const strategy = this.strategies.get(position.strategyId);
    if (!strategy) {
      return { success: false, amountHarvested: 0, compounded: false };
    }

    const yieldAmount = position.pendingYield;

    // Deduct performance fee
    const performanceFee = yieldAmount * strategy.performanceFee;
    const netYield = yieldAmount - performanceFee;

    if (position.autoCompound) {
      // Add to position value
      const totalShares = this.getTotalShares(strategy.id);
      const additionalShares = totalShares > 0
        ? (netYield / strategy.currentCapacity) * totalShares
        : netYield;

      position.shares += additionalShares;
      position.depositedAmount += netYield;
      position.currentValue = this.calculatePositionValue(position, strategy);

      strategy.currentCapacity += netYield;
    }

    position.pendingYield = 0;
    position.earnedYield += netYield;
    position.claimedYield += position.autoCompound ? 0 : netYield;
    position.lastHarvest = Date.now();

    // Record transaction
    const tx: TransactionRecord = {
      txHash: `0x${uuidv4().replace(/-/g, '')}`,
      blockNumber: Math.floor(Date.now() / 1000),
      timestamp: Date.now(),
      amount: netYield,
      type: position.autoCompound ? 'compound' : 'harvest',
      from: strategy.id,
      to: position.autoCompound ? strategy.id : position.agentAddress,
    };
    position.transactions.push(tx);

    this.emit('strategy:harvested', {
      strategyId: strategy.id,
      positionId,
      amount: netYield,
      compounded: position.autoCompound,
    });

    return {
      success: true,
      amountHarvested: netYield,
      compounded: position.autoCompound,
      newValue: position.currentValue,
      txHash: tx.txHash,
    };
  }

  /**
   * Set auto-compound preference
   */
  async setAutoCompound(positionId: string, enabled: boolean): Promise<boolean> {
    const position = this.positions.get(positionId);
    if (!position) return false;

    position.autoCompound = enabled;
    return true;
  }

  /**
   * Calculate and distribute yield to all positions
   */
  private async calculateAndDistributeYield(): Promise<void> {
    for (const strategy of this.strategies.values()) {
      if (strategy.status !== 'active' || strategy.currentCapacity <= 0) continue;

      // Calculate yield based on current APY
      const hourlyRate = strategy.currentAPY / (365 * 24);
      const yield_ = strategy.currentCapacity * hourlyRate;

      // Distribute to positions
      const positionIds = this.positionsByStrategy.get(strategy.id);
      if (!positionIds) continue;

      for (const positionId of positionIds) {
        const position = this.positions.get(positionId);
        if (!position) continue;

        const shareRatio = position.shares / this.getTotalShares(strategy.id);
        const positionYield = yield_ * shareRatio;

        position.pendingYield += positionYield;
        position.currentValue = this.calculatePositionValue(position, strategy) + position.pendingYield;
      }

      // Update strategy
      strategy.totalYieldGenerated += yield_;

      // Add some randomness to current APY (simulate market conditions)
      const variance = (Math.random() - 0.5) * 0.02; // ±1%
      strategy.currentAPY = Math.max(0.01, strategy.expectedAPY + variance);
    }
  }

  // ==========================================================================
  // REBALANCING
  // ==========================================================================

  /**
   * Rebalance a strategy to match target allocation
   */
  async rebalance(strategyId: string): Promise<RebalanceResult> {
    const strategy = this.strategies.get(strategyId);
    if (!strategy || strategy.status !== 'active') {
      return {
        success: false,
        previousAllocation: strategy?.allocation || { liquidityPool: 0, creditLending: 0, insuranceBacking: 0, providerStaking: 0, reserve: 0 },
        newAllocation: strategy?.allocation || { liquidityPool: 0, creditLending: 0, insuranceBacking: 0, providerStaking: 0, reserve: 0 },
      };
    }

    const previousAllocation = { ...strategy.allocation };

    // In a real implementation, this would:
    // 1. Calculate current allocation
    // 2. Determine trades needed
    // 3. Execute rebalancing transactions

    // For demo, we just update the timestamp
    strategy.lastRebalance = Date.now();

    // Record historical return
    const daysSinceInception = (Date.now() - strategy.createdAt) / (24 * 60 * 60 * 1000);
    if (daysSinceInception >= 30) {
      const returnPct = (strategy.totalYieldGenerated / strategy.totalDeposits) * 100;
      strategy.historicalReturns.push({
        period: 'monthly',
        startDate: strategy.lastRebalance - 30 * 24 * 60 * 60 * 1000,
        endDate: strategy.lastRebalance,
        returnPercentage: returnPct,
        tvlStart: strategy.currentCapacity - strategy.totalYieldGenerated,
        tvlEnd: strategy.currentCapacity,
      });
    }

    this.emit('strategy:rebalanced', {
      strategyId,
      timestamp: strategy.lastRebalance,
    });

    return {
      success: true,
      previousAllocation,
      newAllocation: strategy.allocation,
    };
  }

  private async rebalanceAllStrategies(): Promise<void> {
    for (const strategy of this.strategies.values()) {
      if (strategy.status === 'active') {
        await this.rebalance(strategy.id);
      }
    }
  }

  // ==========================================================================
  // FUND ALLOCATION
  // ==========================================================================

  private async allocateFunds(strategy: DeFiYieldStrategy, amount: number): Promise<void> {
    // In a real implementation, this would allocate to underlying protocols
    // For demo, we just simulate the allocation

    const allocation = strategy.allocation;

    // Liquidity Pool
    if (this.liquidityPool && allocation.liquidityPool > 0) {
      const lpAmount = amount * allocation.liquidityPool;
      // Would deposit to liquidity pool
      this.emit('strategy:allocated', { protocol: 'liquidityPool', amount: lpAmount });
    }

    // Credit Lending
    if (allocation.creditLending > 0) {
      const lendingAmount = amount * allocation.creditLending;
      this.emit('strategy:allocated', { protocol: 'creditLending', amount: lendingAmount });
    }

    // Insurance Backing
    if (this.insurancePool && allocation.insuranceBacking > 0) {
      const insuranceAmount = amount * allocation.insuranceBacking;
      this.emit('strategy:allocated', { protocol: 'insuranceBacking', amount: insuranceAmount });
    }

    // Provider Staking
    if (this.providerStaking && allocation.providerStaking > 0) {
      const stakingAmount = amount * allocation.providerStaking;
      this.emit('strategy:allocated', { protocol: 'providerStaking', amount: stakingAmount });
    }

    // Reserve stays liquid
    // allocation.reserve portion is kept available
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  private findExistingPosition(strategyId: string, agentId: string): string | undefined {
    const agentPositions = this.positionsByAgent.get(agentId);
    if (!agentPositions) return undefined;

    for (const positionId of agentPositions) {
      const position = this.positions.get(positionId);
      if (position && position.strategyId === strategyId) {
        return positionId;
      }
    }
    return undefined;
  }

  private getTotalShares(strategyId: string): number {
    const positionIds = this.positionsByStrategy.get(strategyId);
    if (!positionIds) return 0;

    let total = 0;
    for (const positionId of positionIds) {
      const position = this.positions.get(positionId);
      if (position) {
        total += position.shares;
      }
    }
    return total;
  }

  private calculatePositionValue(position: StrategyPosition, strategy: DeFiYieldStrategy): number {
    const totalShares = this.getTotalShares(strategy.id);
    if (totalShares <= 0) return position.depositedAmount;

    const shareRatio = position.shares / totalShares;
    return strategy.currentCapacity * shareRatio;
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  getStrategy(strategyId: string): DeFiYieldStrategy | undefined {
    return this.strategies.get(strategyId);
  }

  getAllStrategies(): DeFiYieldStrategy[] {
    return Array.from(this.strategies.values());
  }

  getActiveStrategies(): DeFiYieldStrategy[] {
    return Array.from(this.strategies.values()).filter(s => s.status === 'active');
  }

  getPosition(positionId: string): StrategyPosition | undefined {
    return this.positions.get(positionId);
  }

  getPositionsByAgent(agentId: string): StrategyPosition[] {
    const positionIds = this.positionsByAgent.get(agentId);
    if (!positionIds) return [];

    return Array.from(positionIds)
      .map(id => this.positions.get(id))
      .filter((p): p is StrategyPosition => p !== undefined);
  }

  getPositionsByStrategy(strategyId: string): StrategyPosition[] {
    const positionIds = this.positionsByStrategy.get(strategyId);
    if (!positionIds) return [];

    return Array.from(positionIds)
      .map(id => this.positions.get(id))
      .filter((p): p is StrategyPosition => p !== undefined);
  }

  getStats(): {
    totalStrategies: number;
    totalTVL: number;
    totalYieldGenerated: number;
    totalPositions: number;
    averageAPY: number;
  } {
    let totalTVL = 0;
    let totalYield = 0;
    let weightedAPY = 0;

    for (const strategy of this.strategies.values()) {
      totalTVL += strategy.currentCapacity;
      totalYield += strategy.totalYieldGenerated;
      weightedAPY += strategy.currentAPY * strategy.currentCapacity;
    }

    return {
      totalStrategies: this.strategies.size,
      totalTVL,
      totalYieldGenerated: totalYield,
      totalPositions: this.positions.size,
      averageAPY: totalTVL > 0 ? weightedAPY / totalTVL : 0,
    };
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  destroy(): void {
    if (this.rebalanceTimer) {
      clearInterval(this.rebalanceTimer);
    }
    if (this.yieldTimer) {
      clearInterval(this.yieldTimer);
    }
    this.removeAllListeners();
  }
}
