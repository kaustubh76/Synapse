/**
 * Synapse DeFi Module - Type Definitions
 *
 * Comprehensive types for the agent economy DeFi infrastructure:
 * - Liquidity Pools
 * - Credit Lending (Under-collateralized)
 * - Flash Loans
 * - Insurance Pools
 * - Provider Staking
 * - Yield Strategies
 */

import { EventEmitter } from 'events';

// =============================================================================
// COMMON TYPES
// =============================================================================

// Import CreditTier from LLM module to maintain consistency
// We re-export it for DeFi module consumers
export type { CreditTier } from '../llm/types.js';
import type { CreditTier } from '../llm/types.js';

export interface TransactionRecord {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  amount: number;
  type: string;
  from: string;
  to: string;
  explorerUrl?: string;
}

export interface APYDataPoint {
  timestamp: number;
  apy: number;
  tvl: number;
}

// =============================================================================
// LIQUIDITY POOL TYPES
// =============================================================================

export interface LiquidityPool {
  id: string;
  name: string;
  description: string;

  // Liquidity metrics
  totalLiquidity: number;
  availableLiquidity: number;
  reservedLiquidity: number;

  // LP Token tracking
  totalShares: number;
  sharePrice: number;

  // Yield metrics
  apy: number;
  apyHistory: APYDataPoint[];
  totalYieldDistributed: number;

  // Utilization
  utilizationRate: number;
  targetUtilization: number;

  // Risk parameters
  reserveRatio: number;
  maxUtilization: number;

  // Fee structure
  depositFee: number;
  withdrawalFee: number;
  performanceFee: number;

  // Status
  status: 'active' | 'paused' | 'deprecated';
  createdAt: number;
  lastYieldDistribution: number;
}

export interface LPPosition {
  id: string;
  poolId: string;
  agentId: string;
  agentAddress: string;

  // Position details
  shares: number;
  depositedAmount: number;
  currentValue: number;

  // Yield tracking
  earnedYield: number;
  claimedYield: number;
  pendingYield: number;
  autoCompound: boolean;

  // Lock (optional for bonus APY)
  lockPeriod?: number;
  unlockTime?: number;
  lockedBonus?: number;

  // Timing
  depositedAt: number;
  lastYieldClaim: number;

  // Transaction history
  transactions: TransactionRecord[];
}

export interface PoolConfig {
  name: string;
  description: string;
  reserveRatio: number;
  targetUtilization: number;
  maxUtilization: number;
  depositFee: number;
  withdrawalFee: number;
  performanceFee: number;
}

export interface DepositResult {
  success: boolean;
  positionId: string;
  sharesMinted: number;
  depositedAmount: number;
  fee: number;
  txHash?: string;
}

export interface WithdrawalResult {
  success: boolean;
  sharesBurned: number;
  amountReceived: number;
  fee: number;
  yieldClaimed: number;
  txHash?: string;
}

export interface YieldClaimResult {
  success: boolean;
  amountClaimed: number;
  txHash?: string;
}

// =============================================================================
// CREDIT LENDING TYPES
// =============================================================================

export interface CreditLine {
  id: string;
  agentId: string;
  agentAddress: string;

  // Credit parameters
  creditLimit: number;
  outstandingBalance: number;
  availableCredit: number;

  // Collateral
  collateralAmount: number;
  collateralRatio: number;
  effectiveCollateralRatio: number;

  // Interest
  interestRate: number;
  accruedInterest: number;
  lastInterestAccrual: number;

  // Risk parameters
  creditScore: number;
  creditTier: CreditTier;
  healthFactor: number;

  // History
  totalBorrowed: number;
  totalRepaid: number;
  totalInterestPaid: number;
  latePayments: number;
  onTimePayments: number;

  // Status
  status: 'active' | 'defaulted' | 'closed' | 'liquidating';
  createdAt: number;
  lastActivityAt: number;

  // Transactions
  transactions: TransactionRecord[];
}

export interface CreditLoan {
  id: string;
  creditLineId: string;
  agentId: string;

  // Loan details
  principal: number;
  interestRate: number;
  accruedInterest: number;
  totalOwed: number;

  // Repayment
  amountRepaid: number;
  remainingBalance: number;

  // Timing
  borrowedAt: number;
  dueDate?: number;
  repaidAt?: number;

  // Purpose
  purpose: string;
  intentId?: string;

  // Status
  status: 'active' | 'repaid' | 'defaulted' | 'liquidated';
}

export interface BorrowResult {
  success: boolean;
  loanId: string;
  amount: number;
  interestRate: number;
  txHash?: string;
  error?: string;
  realTransfer?: boolean;
}

export interface RepayResult {
  success: boolean;
  amountRepaid: number;
  principalRepaid: number;
  interestRepaid: number;
  remainingBalance: number;
  txHash?: string;
  realTransfer?: boolean;
}

export interface LiquidationStatus {
  isLiquidatable: boolean;
  healthFactor: number;
  warningLevel: 'safe' | 'warning' | 'danger' | 'liquidatable';
  shortfall?: number;
  liquidationPenalty: number;
}

export interface LiquidationResult {
  success: boolean;
  liquidatedAmount: number;
  collateralSeized: number;
  penalty: number;
  txHash?: string;
}

// DeFi-specific credit tier configuration with lending parameters
export const DEFI_CREDIT_TIER_CONFIG: Record<CreditTier, {
  minScore: number;
  maxScore: number;
  creditLimit: number;
  interestRate: number;
  collateralRequired: number;
  escrowRequired: number;
  discount: number;
}> = {
  exceptional: { minScore: 800, maxScore: 850, creditLimit: 10000, interestRate: 0.05, collateralRequired: 0, escrowRequired: 0, discount: 0.20 },
  excellent: { minScore: 740, maxScore: 799, creditLimit: 5000, interestRate: 0.08, collateralRequired: 0.25, escrowRequired: 0.25, discount: 0.15 },
  good: { minScore: 670, maxScore: 739, creditLimit: 1000, interestRate: 0.12, collateralRequired: 0.50, escrowRequired: 0.50, discount: 0.10 },
  fair: { minScore: 580, maxScore: 669, creditLimit: 200, interestRate: 0.18, collateralRequired: 0.75, escrowRequired: 1.00, discount: 0 },
  subprime: { minScore: 300, maxScore: 579, creditLimit: 0, interestRate: 0.25, collateralRequired: 1.00, escrowRequired: 1.00, discount: -0.10 },
};

// =============================================================================
// FLASH LOAN TYPES
// =============================================================================

export interface FlashLoan {
  id: string;
  borrower: string;
  borrowerAddress: string;

  // Loan details
  amount: number;
  fee: number;
  feeRate: number;

  // Execution context
  intentId?: string;
  purpose: string;
  callbackData?: string;

  // Timing
  borrowedAt: number;
  repaidAt?: number;
  executionDurationMs?: number;

  // Result
  status: 'executing' | 'repaid' | 'defaulted';
  repaidAmount?: number;
  profit?: number;
  txHash?: string;
  error?: string;
}

export interface FlashLoanCallback {
  (loan: FlashLoan): Promise<FlashLoanCallbackResult>;
}

export interface FlashLoanCallbackResult {
  success: boolean;
  repaidAmount: number;
  profit?: number;
  error?: string;
}

export interface FlashLoanResult {
  success: boolean;
  loanId: string;
  amount: number;
  fee: number;
  profit?: number;
  executionDurationMs: number;
  txHash?: string;
  error?: string;
}

export interface FlashLoanAvailability {
  available: boolean;
  maxAmount: number;
  feeRate: number;
  poolUtilization: number;
}

// Flash loan constants
export const FLASH_LOAN_CONFIG = {
  feeRate: 0.0005,           // 0.05%
  maxPoolRatio: 0.5,         // Max 50% of pool per flash loan
  maxExecutionTimeMs: 30000, // 30 second timeout
};

// =============================================================================
// INSURANCE POOL TYPES
// =============================================================================

export type InsuranceRiskCategory =
  | 'provider_failure'
  | 'dispute_coverage'
  | 'smart_contract'
  | 'oracle_failure'
  | 'slashing_protection';

export interface InsurancePool {
  id: string;
  name: string;
  description: string;
  riskCategory: InsuranceRiskCategory;

  // Funds
  totalFunds: number;
  availableFunds: number;
  reservedFunds: number;

  // Coverage
  totalCoverage: number;
  activePolicies: number;
  maxCoveragePerPolicy: number;
  coverageRatio: number;

  // Risk model
  claimCount: number;
  totalClaimsPaid: number;
  lossRatio: number;

  // Pricing
  basePremiumRate: number;
  currentPremiumRate: number;

  // Stakers
  totalStaked: number;
  stakerCount: number;
  stakerAPY: number;

  // Status
  status: 'active' | 'paused' | 'depleted';
  createdAt: number;
  lastClaimAt?: number;
}

export interface InsurancePolicy {
  id: string;
  poolId: string;

  // Policyholder
  holderId: string;
  holderAddress: string;

  // Coverage
  coverageAmount: number;
  coverageType: InsuranceRiskCategory;
  deductible: number;

  // Premiums
  premiumRate: number;
  premiumPaid: number;
  nextPremiumDue: number;
  premiumInterval: number;

  // Status
  status: 'active' | 'expired' | 'claimed' | 'cancelled';
  createdAt: number;
  expiresAt: number;

  // Claims
  claimCount: number;
  totalClaimedAmount: number;
}

export interface InsuranceClaim {
  id: string;
  policyId: string;
  poolId: string;

  // Claimant
  claimantId: string;
  claimantAddress: string;

  // Claim details
  claimAmount: number;
  reason: string;
  evidence: ClaimEvidence[];

  // Related entities
  intentId?: string;
  disputeId?: string;
  providerId?: string;

  // Resolution
  status: 'pending' | 'under_review' | 'approved' | 'denied' | 'paid';
  approvedAmount?: number;
  denialReason?: string;
  reviewNotes?: string;

  // Timing
  filedAt: number;
  reviewedAt?: number;
  resolvedAt?: number;
  paidAt?: number;

  // Transaction
  txHash?: string;
}

export interface ClaimEvidence {
  type: 'transaction' | 'dispute' | 'screenshot' | 'log' | 'attestation';
  description: string;
  data: string;
  timestamp: number;
}

export interface InsuranceStaker {
  id: string;
  poolId: string;
  stakerAddress: string;

  stakedAmount: number;
  sharePercentage: number;

  earnedYield: number;
  claimedYield: number;

  stakedAt: number;
  lastYieldClaim: number;
}

export interface PolicyPurchaseParams {
  poolId: string;
  holderId: string;
  holderAddress: string;
  coverageAmount: number;
  durationDays: number;
}

export interface PolicyPurchaseResult {
  success: boolean;
  policyId: string;
  premium: number;
  coverageAmount: number;
  expiresAt: number;
  txHash?: string;
}

export interface ClaimRequest {
  policyId: string;
  amount: number;
  reason: string;
  evidence: Omit<ClaimEvidence, 'timestamp'>[];
  intentId?: string;
  disputeId?: string;
}

export interface ClaimReviewResult {
  approved: boolean;
  approvedAmount?: number;
  denialReason?: string;
  reviewNotes: string;
}

// Insurance configuration
export const INSURANCE_CONFIG: Record<InsuranceRiskCategory, {
  basePremiumRate: number;
  maxCoverageRatio: number;
  deductibleRate: number;
  claimProcessingDays: number;
}> = {
  provider_failure: { basePremiumRate: 0.02, maxCoverageRatio: 5, deductibleRate: 0.05, claimProcessingDays: 3 },
  dispute_coverage: { basePremiumRate: 0.03, maxCoverageRatio: 3, deductibleRate: 0.10, claimProcessingDays: 7 },
  smart_contract: { basePremiumRate: 0.05, maxCoverageRatio: 2, deductibleRate: 0.15, claimProcessingDays: 14 },
  oracle_failure: { basePremiumRate: 0.025, maxCoverageRatio: 4, deductibleRate: 0.05, claimProcessingDays: 5 },
  slashing_protection: { basePremiumRate: 0.04, maxCoverageRatio: 3, deductibleRate: 0.10, claimProcessingDays: 7 },
};

// =============================================================================
// PROVIDER STAKING TYPES
// =============================================================================

export type StakingTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface ProviderStake {
  id: string;
  providerId: string;
  providerAddress: string;

  // Staking
  stakedAmount: number;
  stakingTier: StakingTier;
  lockedUntil?: number;
  lockBonus?: number;

  // Benefits
  priorityMultiplier: number;
  feeDiscount: number;
  maxConcurrentIntents: number;

  // Slashing
  slashableAmount: number;
  totalSlashed: number;
  slashHistory: SlashEvent[];

  // Yield
  earnedYield: number;
  claimedYield: number;
  stakingAPY: number;

  // Status
  status: 'active' | 'unbonding' | 'slashed' | 'withdrawn';
  unbondingEndsAt?: number;

  // Timing
  createdAt: number;
  lastActivityAt: number;

  // Transactions
  transactions: TransactionRecord[];
}

export interface SlashEvent {
  id: string;
  stakeId: string;
  amount: number;
  reason: string;
  disputeId?: string;
  timestamp: number;
  txHash?: string;
}

export interface StakeResult {
  success: boolean;
  stakeId: string;
  amount: number;
  tier: StakingTier;
  benefits: StakingBenefits;
  txHash?: string;
}

export interface UnstakeResult {
  success: boolean;
  amount: number;
  unbondingPeriod: number;
  availableAt: number;
  txHash?: string;
}

export interface StakingBenefits {
  tier: StakingTier;
  priorityMultiplier: number;
  feeDiscount: number;
  maxConcurrentIntents: number;
  slashProtection: number;
  stakingAPY: number;
}

export interface SlashResult {
  success: boolean;
  slashedAmount: number;
  remainingStake: number;
  newTier: StakingTier;
  txHash?: string;
}

// Staking tier configuration
export const STAKING_TIER_CONFIG: Record<StakingTier, {
  minStake: number;
  priorityMultiplier: number;
  feeDiscount: number;
  maxConcurrentIntents: number;
  slashProtection: number;
  unbondingDays: number;
  baseAPY: number;
}> = {
  bronze: { minStake: 10, priorityMultiplier: 1.0, feeDiscount: 0, maxConcurrentIntents: 5, slashProtection: 0, unbondingDays: 1, baseAPY: 0.05 },
  silver: { minStake: 100, priorityMultiplier: 1.1, feeDiscount: 0.05, maxConcurrentIntents: 10, slashProtection: 0.1, unbondingDays: 3, baseAPY: 0.08 },
  gold: { minStake: 500, priorityMultiplier: 1.25, feeDiscount: 0.10, maxConcurrentIntents: 25, slashProtection: 0.2, unbondingDays: 7, baseAPY: 0.12 },
  platinum: { minStake: 2000, priorityMultiplier: 1.5, feeDiscount: 0.15, maxConcurrentIntents: 50, slashProtection: 0.3, unbondingDays: 14, baseAPY: 0.15 },
  diamond: { minStake: 10000, priorityMultiplier: 2.0, feeDiscount: 0.25, maxConcurrentIntents: 100, slashProtection: 0.5, unbondingDays: 30, baseAPY: 0.20 },
};

// =============================================================================
// YIELD STRATEGY TYPES
// =============================================================================

export type YieldStrategyType = 'conservative' | 'balanced' | 'aggressive';

export interface DeFiYieldAllocation {
  liquidityPool: number;
  creditLending: number;
  insuranceBacking: number;
  providerStaking: number;
  reserve: number;
}

export interface DeFiYieldStrategy {
  id: string;
  name: string;
  description: string;
  type: YieldStrategyType;

  // Allocation targets
  allocation: DeFiYieldAllocation;

  // Performance
  expectedAPY: number;
  currentAPY: number;
  historicalAPY: number;

  // Risk
  riskLevel: number;
  volatility: number;
  maxDrawdown: number;

  // Constraints
  minDeposit: number;
  maxCapacity: number;
  currentCapacity: number;
  lockPeriod: number;

  // Fees
  managementFee: number;
  performanceFee: number;

  // Status
  status: 'active' | 'paused' | 'deprecated';

  // Historical
  totalDeposits: number;
  totalWithdrawals: number;
  totalYieldGenerated: number;
  historicalReturns: StrategyReturn[];

  createdAt: number;
  lastRebalance: number;
}

export interface StrategyReturn {
  period: string;
  startDate: number;
  endDate: number;
  returnPercentage: number;
  tvlStart: number;
  tvlEnd: number;
}

export interface StrategyPosition {
  id: string;
  strategyId: string;
  agentId: string;
  agentAddress: string;

  // Position
  depositedAmount: number;
  currentValue: number;
  shares: number;

  // Yield
  earnedYield: number;
  claimedYield: number;
  pendingYield: number;
  autoCompound: boolean;

  // Lock
  lockedUntil?: number;
  earlyWithdrawalPenalty?: number;

  // Timing
  depositedAt: number;
  lastHarvest: number;

  // Transactions
  transactions: TransactionRecord[];
}

export interface StrategyDepositResult {
  success: boolean;
  positionId: string;
  shares: number;
  depositedAmount: number;
  lockedUntil?: number;
  txHash?: string;
}

export interface StrategyWithdrawResult {
  success: boolean;
  sharesBurned: number;
  amountReceived: number;
  yieldClaimed: number;
  penalty?: number;
  txHash?: string;
}

export interface HarvestResult {
  success: boolean;
  amountHarvested: number;
  compounded: boolean;
  newValue?: number;
  txHash?: string;
}

export interface RebalanceResult {
  success: boolean;
  previousAllocation: DeFiYieldAllocation;
  newAllocation: DeFiYieldAllocation;
  gasCost?: number;
}

// Yield strategy presets
export const YIELD_STRATEGY_PRESETS: Record<YieldStrategyType, {
  allocation: DeFiYieldAllocation;
  expectedAPY: number;
  riskLevel: number;
  lockPeriod: number;
  managementFee: number;
  performanceFee: number;
}> = {
  conservative: {
    allocation: { liquidityPool: 0.30, creditLending: 0.10, insuranceBacking: 0.10, providerStaking: 0.10, reserve: 0.40 },
    expectedAPY: 0.05,
    riskLevel: 2,
    lockPeriod: 0,
    managementFee: 0.005,
    performanceFee: 0.05,
  },
  balanced: {
    allocation: { liquidityPool: 0.35, creditLending: 0.25, insuranceBacking: 0.15, providerStaking: 0.15, reserve: 0.10 },
    expectedAPY: 0.12,
    riskLevel: 5,
    lockPeriod: 604800, // 7 days
    managementFee: 0.01,
    performanceFee: 0.10,
  },
  aggressive: {
    allocation: { liquidityPool: 0.20, creditLending: 0.40, insuranceBacking: 0.20, providerStaking: 0.15, reserve: 0.05 },
    expectedAPY: 0.25,
    riskLevel: 8,
    lockPeriod: 2592000, // 30 days
    managementFee: 0.02,
    performanceFee: 0.20,
  },
};

// =============================================================================
// PORTFOLIO & STATS TYPES
// =============================================================================

export interface DeFiPortfolio {
  agentId: string;
  agentAddress: string;

  // Summary
  totalValue: number;
  totalDeposited: number;
  totalEarned: number;
  totalBorrowed: number;

  // Positions
  liquidityPositions: LPPosition[];
  creditLines: CreditLine[];
  insurancePolicies: InsurancePolicy[];
  stakingPositions: ProviderStake[];
  strategyPositions: StrategyPosition[];

  // Metrics
  netAPY: number;
  healthScore: number;
  riskExposure: number;

  lastUpdated: number;
}

export interface DeFiSystemStats {
  // TVL
  totalValueLocked: number;
  liquidityPoolTVL: number;
  stakingTVL: number;
  insuranceTVL: number;
  strategyTVL: number;

  // Activity
  totalDeposits: number;
  totalWithdrawals: number;
  totalBorrows: number;
  totalRepayments: number;

  // Yields
  averageAPY: number;
  totalYieldDistributed: number;

  // Lending
  totalOutstandingLoans: number;
  averageInterestRate: number;
  defaultRate: number;

  // Flash loans
  totalFlashLoans: number;
  flashLoanVolume: number;
  flashLoanFees: number;

  // Insurance
  totalCoverage: number;
  totalPremiums: number;
  totalClaimsPaid: number;

  // Users
  uniqueDepositors: number;
  uniqueBorrowers: number;
  uniqueStakers: number;

  lastUpdated: number;
}

// =============================================================================
// EVENT TYPES
// =============================================================================

export interface DeFiEvent {
  type: DeFiEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

export type DeFiEventType =
  | 'pool:deposit'
  | 'pool:withdraw'
  | 'pool:yield_distributed'
  | 'credit:line_opened'
  | 'credit:borrowed'
  | 'credit:repaid'
  | 'credit:liquidated'
  | 'flash:executed'
  | 'flash:failed'
  | 'insurance:policy_purchased'
  | 'insurance:claim_filed'
  | 'insurance:claim_paid'
  | 'staking:staked'
  | 'staking:unstaked'
  | 'staking:slashed'
  | 'strategy:deposited'
  | 'strategy:withdrawn'
  | 'strategy:harvested'
  | 'strategy:rebalanced';

// =============================================================================
// INTEREST RATE MODEL
// =============================================================================

export interface InterestRateModel {
  baseRate: number;
  slope1: number;
  slope2: number;
  targetUtilization: number;
}

export const DEFAULT_INTEREST_RATE_MODEL: InterestRateModel = {
  baseRate: 0.02,        // 2%
  slope1: 0.08,          // 8% (below target)
  slope2: 0.50,          // 50% (above target)
  targetUtilization: 0.80, // 80%
};

/**
 * Calculate interest rate based on utilization (Compound-style)
 */
export function calculateInterestRate(
  utilization: number,
  model: InterestRateModel = DEFAULT_INTEREST_RATE_MODEL
): number {
  if (utilization <= model.targetUtilization) {
    return model.baseRate + (utilization / model.targetUtilization) * model.slope1;
  } else {
    const excess = utilization - model.targetUtilization;
    const excessRatio = excess / (1 - model.targetUtilization);
    return model.baseRate + model.slope1 + excessRatio * model.slope2;
  }
}

/**
 * Calculate health factor for a credit line
 */
export function calculateHealthFactor(creditLine: CreditLine): number {
  if (creditLine.outstandingBalance === 0) return Infinity;

  const tierConfig = DEFI_CREDIT_TIER_CONFIG[creditLine.creditTier];
  const requiredCollateral = creditLine.outstandingBalance * tierConfig.collateralRequired;

  if (requiredCollateral === 0) {
    // For exceptional tier (0% collateral), use credit score as health indicator
    return creditLine.creditScore / 700;
  }

  return creditLine.collateralAmount / requiredCollateral;
}

/**
 * Determine staking tier from staked amount
 */
export function getStakingTier(stakedAmount: number): StakingTier {
  if (stakedAmount >= STAKING_TIER_CONFIG.diamond.minStake) return 'diamond';
  if (stakedAmount >= STAKING_TIER_CONFIG.platinum.minStake) return 'platinum';
  if (stakedAmount >= STAKING_TIER_CONFIG.gold.minStake) return 'gold';
  if (stakedAmount >= STAKING_TIER_CONFIG.silver.minStake) return 'silver';
  return 'bronze';
}

/**
 * Determine credit tier from credit score
 */
export function getCreditTier(creditScore: number): CreditTier {
  if (creditScore >= DEFI_CREDIT_TIER_CONFIG.exceptional.minScore) return 'exceptional';
  if (creditScore >= DEFI_CREDIT_TIER_CONFIG.excellent.minScore) return 'excellent';
  if (creditScore >= DEFI_CREDIT_TIER_CONFIG.good.minScore) return 'good';
  if (creditScore >= DEFI_CREDIT_TIER_CONFIG.fair.minScore) return 'fair';
  return 'subprime';
}
