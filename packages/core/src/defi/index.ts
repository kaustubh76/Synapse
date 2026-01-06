/**
 * Synapse DeFi Module
 *
 * Comprehensive DeFi infrastructure for the AI agent economy.
 *
 * Features:
 * - Liquidity Pools: Earn yield by providing liquidity
 * - Credit Lending: Under-collateralized loans based on reputation
 * - Flash Loans: Instant uncollateralized loans
 * - Insurance: Risk coverage for the agent economy
 * - Provider Staking: Stake for priority and rewards
 * - Yield Strategies: Automated yield optimization
 */

// Types
export * from './types.js';

// Managers
export { LiquidityPoolManager, type LiquidityPoolManagerConfig } from './liquidity-pool.js';
export { CreditLendingManager, type CreditLendingManagerConfig } from './credit-lending.js';
export { FlashLoanManager, type FlashLoanManagerConfig, createArbitrageCallback, createIntentExecutionCallback } from './flash-loans.js';
export { InsurancePoolManager, type InsurancePoolManagerConfig } from './insurance-pool.js';
export { ProviderStakingManager, type ProviderStakingManagerConfig } from './provider-staking.js';
export { YieldStrategyManager, type YieldStrategyManagerConfig } from './yield-strategies.js';

// DeFi Router
export { DeFiRouter, type DeFiRouterConfig } from './defi-router.js';
