/**
 * Credit Lending Manager
 *
 * Implements under-collateralized lending for AI agents based on credit scores.
 * This is the key innovation: reputation-backed lending where high-reputation
 * agents can borrow with 0% collateral.
 *
 * Features:
 * - Credit lines based on agent credit score/tier
 * - Dynamic interest rates by tier (5% - 25% APR)
 * - Collateral requirements (0% - 100% based on tier)
 * - Automatic interest accrual
 * - Liquidation mechanism for underwater positions
 * - Integration with existing AgentCreditScorer
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';
import { getUSDCTransfer } from '@synapse/mcp-x402';
import {
  CreditLine,
  CreditLoan,
  CreditTier,
  BorrowResult,
  RepayResult,
  LiquidationStatus,
  LiquidationResult,
  TransactionRecord,
  DEFI_CREDIT_TIER_CONFIG,
  calculateHealthFactor,
  getCreditTier,
} from './types.js';
import { LiquidityPoolManager } from './liquidity-pool.js';

export interface CreditLendingManagerConfig {
  liquidityPoolManager: LiquidityPoolManager;
  defaultPoolId?: string;
  interestAccrualInterval?: number; // ms
  liquidationThreshold?: number; // health factor below this triggers liquidation
  liquidationPenalty?: number; // % penalty for liquidation
  enableRealTransfers?: boolean;
  platformWalletAddress?: string;
  platformPrivateKey?: string;
  rpcUrl?: string;
}

export class CreditLendingManager extends EventEmitter {
  private creditLines: Map<string, CreditLine> = new Map();
  private creditLinesByAgent: Map<string, string> = new Map(); // agentId -> creditLineId
  private loans: Map<string, CreditLoan> = new Map();
  private loansByCreditLine: Map<string, Set<string>> = new Map();

  private liquidityPool: LiquidityPoolManager;
  private defaultPoolId: string;
  private interestAccrualTimer?: NodeJS.Timeout;
  private liquidationThreshold: number;
  private liquidationPenalty: number;

  // Real transfer config
  private enableRealTransfers: boolean;
  private platformWalletAddress: string;
  private platformPrivateKey: string;
  private rpcUrl: string;

  constructor(config: CreditLendingManagerConfig) {
    super();
    this.liquidityPool = config.liquidityPoolManager;
    this.defaultPoolId = config.defaultPoolId ?? 'main_pool';
    this.liquidationThreshold = config.liquidationThreshold ?? 1.0;
    this.liquidationPenalty = config.liquidationPenalty ?? 0.05; // 5%

    // Real transfer config (uses Eigen wallet)
    this.enableRealTransfers = config.enableRealTransfers ?? (process.env.ENABLE_REAL_DEFI === 'true');
    this.platformWalletAddress = config.platformWalletAddress ?? process.env.EIGENCLOUD_WALLET_ADDRESS ?? '';
    this.platformPrivateKey = config.platformPrivateKey ?? process.env.EIGENCLOUD_PRIVATE_KEY ?? '';
    this.rpcUrl = config.rpcUrl ?? process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org';

    if (this.enableRealTransfers) {
      console.log('[CreditLending] REAL USDC transfers ENABLED');
      console.log('[CreditLending] Platform wallet:', this.platformWalletAddress);
    }

    // Start interest accrual timer
    const interval = config.interestAccrualInterval ?? 3600000; // 1 hour
    this.interestAccrualTimer = setInterval(() => {
      this.accrueAllInterest();
    }, interval);
  }

  // ==========================================================================
  // CREDIT LINE MANAGEMENT
  // ==========================================================================

  /**
   * Open a credit line for an agent based on their credit score
   */
  async openCreditLine(
    agentId: string,
    agentAddress: string,
    creditScore: number,
    initialCollateral: number = 0
  ): Promise<CreditLine> {
    // Check if agent already has a credit line
    const existingLineId = this.creditLinesByAgent.get(agentId);
    if (existingLineId) {
      const existing = this.creditLines.get(existingLineId);
      if (existing && existing.status === 'active') {
        return existing;
      }
    }

    const tier = getCreditTier(creditScore);
    const tierConfig = DEFI_CREDIT_TIER_CONFIG[tier];

    const creditLine: CreditLine = {
      id: `credit_${uuidv4().slice(0, 8)}`,
      agentId,
      agentAddress,
      creditLimit: tierConfig.creditLimit,
      outstandingBalance: 0,
      availableCredit: tierConfig.creditLimit,
      collateralAmount: initialCollateral,
      collateralRatio: tierConfig.collateralRequired,
      effectiveCollateralRatio: initialCollateral > 0 ? Infinity : 0,
      interestRate: tierConfig.interestRate,
      accruedInterest: 0,
      lastInterestAccrual: Date.now(),
      creditScore,
      creditTier: tier,
      healthFactor: Infinity,
      totalBorrowed: 0,
      totalRepaid: 0,
      totalInterestPaid: 0,
      latePayments: 0,
      onTimePayments: 0,
      status: 'active',
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      transactions: [],
    };

    this.creditLines.set(creditLine.id, creditLine);
    this.creditLinesByAgent.set(agentId, creditLine.id);
    this.loansByCreditLine.set(creditLine.id, new Set());

    this.emit('credit:line_opened', {
      creditLineId: creditLine.id,
      agentId,
      creditLimit: creditLine.creditLimit,
      tier,
    });

    return creditLine;
  }

  /**
   * Update credit line based on new credit score
   */
  async updateCreditLine(agentId: string, newCreditScore: number): Promise<CreditLine | null> {
    const creditLineId = this.creditLinesByAgent.get(agentId);
    if (!creditLineId) return null;

    const creditLine = this.creditLines.get(creditLineId);
    if (!creditLine) return null;

    const newTier = getCreditTier(newCreditScore);
    const tierConfig = DEFI_CREDIT_TIER_CONFIG[newTier];

    // Update credit line
    creditLine.creditScore = newCreditScore;
    creditLine.creditTier = newTier;
    creditLine.creditLimit = tierConfig.creditLimit;
    creditLine.interestRate = tierConfig.interestRate;
    creditLine.collateralRatio = tierConfig.collateralRequired;
    creditLine.availableCredit = Math.max(0, creditLine.creditLimit - creditLine.outstandingBalance);
    creditLine.lastActivityAt = Date.now();

    // Update health factor
    creditLine.healthFactor = calculateHealthFactor(creditLine);

    this.emit('credit:line_updated', {
      creditLineId,
      agentId,
      newTier,
      newLimit: creditLine.creditLimit,
    });

    return creditLine;
  }

  /**
   * Close a credit line (must have zero balance)
   */
  async closeCreditLine(creditLineId: string): Promise<boolean> {
    const creditLine = this.creditLines.get(creditLineId);
    if (!creditLine) return false;

    if (creditLine.outstandingBalance > 0) {
      return false; // Cannot close with outstanding balance
    }

    creditLine.status = 'closed';
    this.creditLinesByAgent.delete(creditLine.agentId);

    this.emit('credit:line_closed', {
      creditLineId,
      agentId: creditLine.agentId,
    });

    return true;
  }

  // ==========================================================================
  // BORROWING
  // ==========================================================================

  /**
   * Borrow against a credit line
   */
  async borrow(
    creditLineId: string,
    amount: number,
    purpose: string = 'general',
    intentId?: string
  ): Promise<BorrowResult> {
    const creditLine = this.creditLines.get(creditLineId);
    if (!creditLine || creditLine.status !== 'active') {
      return { success: false, loanId: '', amount: 0, interestRate: 0, error: 'Invalid credit line' };
    }

    // Check available credit
    if (amount > creditLine.availableCredit) {
      return {
        success: false,
        loanId: '',
        amount: 0,
        interestRate: 0,
        error: `Insufficient credit. Available: $${creditLine.availableCredit.toFixed(2)}`,
      };
    }

    // Check collateral requirements
    const tierConfig = DEFI_CREDIT_TIER_CONFIG[creditLine.creditTier];
    const requiredCollateral = (creditLine.outstandingBalance + amount) * tierConfig.collateralRequired;
    if (creditLine.collateralAmount < requiredCollateral) {
      return {
        success: false,
        loanId: '',
        amount: 0,
        interestRate: 0,
        error: `Insufficient collateral. Required: $${requiredCollateral.toFixed(2)}, Have: $${creditLine.collateralAmount.toFixed(2)}`,
      };
    }

    // Borrow from liquidity pool
    const borrowed = await this.liquidityPool.borrowFromPool(this.defaultPoolId, amount);
    if (!borrowed) {
      // Get pool stats for better error message
      const pool = this.liquidityPool.getPool(this.defaultPoolId);
      const availableLiquidity = pool?.availableLiquidity ?? 0;
      const errorMsg = availableLiquidity === 0
        ? 'Liquidity pool is empty. Please wait for deposits or try again later.'
        : `Insufficient liquidity in pool. Available: $${availableLiquidity.toFixed(2)}, Requested: $${amount.toFixed(2)}`;
      return { success: false, loanId: '', amount: 0, interestRate: 0, error: errorMsg };
    }

    // Execute REAL USDC transfer from platform wallet to borrower
    let realTxHash: string | undefined;
    if (this.enableRealTransfers && this.platformPrivateKey && this.platformWalletAddress) {
      try {
        console.log(`[CreditLending] Executing REAL borrow: ${amount} USDC to ${creditLine.agentAddress}`);

        const usdcTransfer = getUSDCTransfer({ rpcUrl: this.rpcUrl });

        // Check platform wallet balance
        const platformBalance = await usdcTransfer.getUSDCBalance(this.platformWalletAddress);
        console.log(`[CreditLending] Platform wallet USDC balance: ${platformBalance}`);

        if (platformBalance < amount) {
          console.warn(`[CreditLending] Platform wallet has insufficient USDC: ${platformBalance} < ${amount}`);
          // Continue with simulated transfer for demo
        } else {
          // Create wallet signer from private key
          const provider = new ethers.JsonRpcProvider(this.rpcUrl);
          const wallet = new ethers.Wallet(this.platformPrivateKey, provider);

          // Execute real transfer from platform wallet to borrower
          const transferResult = await usdcTransfer.transfer(wallet, {
            recipient: creditLine.agentAddress,
            amount: amount,
            reason: `Credit loan disbursement - ${purpose}`,
          });

          if (transferResult.success && transferResult.txHash) {
            realTxHash = transferResult.txHash;
            console.log(`[CreditLending] REAL borrow transfer successful! TxHash: ${realTxHash}`);
          } else {
            console.error(`[CreditLending] Real transfer failed:`, transferResult.error);
            // Continue with simulated transaction
          }
        }
      } catch (error) {
        console.error('[CreditLending] Real borrow transfer failed:', error);
        // Continue with simulated transaction
      }
    }

    // Create loan record
    const loan: CreditLoan = {
      id: `loan_${uuidv4().slice(0, 8)}`,
      creditLineId,
      agentId: creditLine.agentId,
      principal: amount,
      interestRate: creditLine.interestRate,
      accruedInterest: 0,
      totalOwed: amount,
      amountRepaid: 0,
      remainingBalance: amount,
      borrowedAt: Date.now(),
      purpose,
      intentId,
      status: 'active',
    };

    this.loans.set(loan.id, loan);
    this.loansByCreditLine.get(creditLineId)!.add(loan.id);

    // Update credit line
    creditLine.outstandingBalance += amount;
    creditLine.availableCredit = creditLine.creditLimit - creditLine.outstandingBalance;
    creditLine.totalBorrowed += amount;
    creditLine.lastActivityAt = Date.now();
    creditLine.healthFactor = calculateHealthFactor(creditLine);

    // Update effective collateral ratio
    if (creditLine.outstandingBalance > 0) {
      creditLine.effectiveCollateralRatio = creditLine.collateralAmount / creditLine.outstandingBalance;
    }

    // Record transaction (use real tx hash if available)
    const tx: TransactionRecord = {
      txHash: realTxHash || `0x${uuidv4().replace(/-/g, '')}`,
      blockNumber: Math.floor(Date.now() / 1000),
      timestamp: Date.now(),
      amount,
      type: 'borrow',
      from: this.platformWalletAddress || this.defaultPoolId,
      to: creditLine.agentAddress,
    };
    creditLine.transactions.push(tx);

    this.emit('credit:borrowed', {
      creditLineId,
      loanId: loan.id,
      agentId: creditLine.agentId,
      amount,
      interestRate: creditLine.interestRate,
      realTransfer: !!realTxHash,
    });

    return {
      success: true,
      loanId: loan.id,
      amount,
      interestRate: creditLine.interestRate,
      txHash: tx.txHash,
      realTransfer: !!realTxHash,
    };
  }

  /**
   * Repay a loan (partial or full)
   */
  async repay(creditLineId: string, amount: number): Promise<RepayResult> {
    const creditLine = this.creditLines.get(creditLineId);
    if (!creditLine) {
      return {
        success: false,
        amountRepaid: 0,
        principalRepaid: 0,
        interestRepaid: 0,
        remainingBalance: 0,
      };
    }

    // First accrue interest
    await this.accrueInterest(creditLineId);

    const totalOwed = creditLine.outstandingBalance + creditLine.accruedInterest;
    const actualPayment = Math.min(amount, totalOwed);

    if (actualPayment <= 0) {
      return {
        success: false,
        amountRepaid: 0,
        principalRepaid: 0,
        interestRepaid: 0,
        remainingBalance: creditLine.outstandingBalance,
      };
    }

    // Pay interest first, then principal
    let interestPaid = 0;
    let principalPaid = 0;

    if (actualPayment <= creditLine.accruedInterest) {
      interestPaid = actualPayment;
    } else {
      interestPaid = creditLine.accruedInterest;
      principalPaid = actualPayment - interestPaid;
    }

    // Update credit line
    creditLine.accruedInterest -= interestPaid;
    creditLine.outstandingBalance -= principalPaid;
    creditLine.availableCredit = creditLine.creditLimit - creditLine.outstandingBalance;
    creditLine.totalRepaid += actualPayment;
    creditLine.totalInterestPaid += interestPaid;
    creditLine.onTimePayments += 1;
    creditLine.lastActivityAt = Date.now();
    creditLine.healthFactor = calculateHealthFactor(creditLine);

    // Update effective collateral ratio
    if (creditLine.outstandingBalance > 0) {
      creditLine.effectiveCollateralRatio = creditLine.collateralAmount / creditLine.outstandingBalance;
    } else {
      creditLine.effectiveCollateralRatio = Infinity;
    }

    // Repay to liquidity pool
    await this.liquidityPool.repayToPool(this.defaultPoolId, principalPaid, interestPaid);

    // Update loan records
    this.updateLoansAfterRepayment(creditLineId, principalPaid);

    // Record transaction
    const tx: TransactionRecord = {
      txHash: `0x${uuidv4().replace(/-/g, '')}`,
      blockNumber: Math.floor(Date.now() / 1000),
      timestamp: Date.now(),
      amount: actualPayment,
      type: 'repay',
      from: creditLine.agentAddress,
      to: this.defaultPoolId,
    };
    creditLine.transactions.push(tx);

    this.emit('credit:repaid', {
      creditLineId,
      agentId: creditLine.agentId,
      amount: actualPayment,
      principalPaid,
      interestPaid,
      remainingBalance: creditLine.outstandingBalance,
    });

    return {
      success: true,
      amountRepaid: actualPayment,
      principalRepaid: principalPaid,
      interestRepaid: interestPaid,
      remainingBalance: creditLine.outstandingBalance,
      txHash: tx.txHash,
    };
  }

  private updateLoansAfterRepayment(creditLineId: string, principalPaid: number): void {
    const loanIds = this.loansByCreditLine.get(creditLineId);
    if (!loanIds) return;

    let remaining = principalPaid;

    // Pay off oldest loans first
    const loans = Array.from(loanIds)
      .map(id => this.loans.get(id))
      .filter((l): l is CreditLoan => l !== undefined && l.status === 'active')
      .sort((a, b) => a.borrowedAt - b.borrowedAt);

    for (const loan of loans) {
      if (remaining <= 0) break;

      const paymentToLoan = Math.min(remaining, loan.remainingBalance);
      loan.amountRepaid += paymentToLoan;
      loan.remainingBalance -= paymentToLoan;
      remaining -= paymentToLoan;

      if (loan.remainingBalance <= 0) {
        loan.status = 'repaid';
        loan.remainingBalance = 0;
      }
    }
  }

  // ==========================================================================
  // COLLATERAL MANAGEMENT
  // ==========================================================================

  /**
   * Add collateral to a credit line
   */
  async addCollateral(creditLineId: string, amount: number): Promise<boolean> {
    const creditLine = this.creditLines.get(creditLineId);
    if (!creditLine || amount <= 0) return false;

    creditLine.collateralAmount += amount;
    creditLine.lastActivityAt = Date.now();

    // Update effective collateral ratio
    if (creditLine.outstandingBalance > 0) {
      creditLine.effectiveCollateralRatio = creditLine.collateralAmount / creditLine.outstandingBalance;
    }

    creditLine.healthFactor = calculateHealthFactor(creditLine);

    // Record transaction
    const tx: TransactionRecord = {
      txHash: `0x${uuidv4().replace(/-/g, '')}`,
      blockNumber: Math.floor(Date.now() / 1000),
      timestamp: Date.now(),
      amount,
      type: 'collateral_deposit',
      from: creditLine.agentAddress,
      to: creditLineId,
    };
    creditLine.transactions.push(tx);

    this.emit('credit:collateral_added', {
      creditLineId,
      agentId: creditLine.agentId,
      amount,
      totalCollateral: creditLine.collateralAmount,
    });

    return true;
  }

  /**
   * Withdraw collateral from a credit line
   */
  async withdrawCollateral(creditLineId: string, amount: number): Promise<boolean> {
    const creditLine = this.creditLines.get(creditLineId);
    if (!creditLine || amount <= 0) return false;

    // Calculate minimum required collateral
    const tierConfig = DEFI_CREDIT_TIER_CONFIG[creditLine.creditTier];
    const requiredCollateral = creditLine.outstandingBalance * tierConfig.collateralRequired;
    const withdrawableAmount = creditLine.collateralAmount - requiredCollateral;

    if (amount > withdrawableAmount) {
      return false; // Cannot withdraw - would undercollateralize
    }

    creditLine.collateralAmount -= amount;
    creditLine.lastActivityAt = Date.now();

    // Update effective collateral ratio
    if (creditLine.outstandingBalance > 0) {
      creditLine.effectiveCollateralRatio = creditLine.collateralAmount / creditLine.outstandingBalance;
    }

    creditLine.healthFactor = calculateHealthFactor(creditLine);

    // Record transaction
    const tx: TransactionRecord = {
      txHash: `0x${uuidv4().replace(/-/g, '')}`,
      blockNumber: Math.floor(Date.now() / 1000),
      timestamp: Date.now(),
      amount,
      type: 'collateral_withdraw',
      from: creditLineId,
      to: creditLine.agentAddress,
    };
    creditLine.transactions.push(tx);

    this.emit('credit:collateral_withdrawn', {
      creditLineId,
      agentId: creditLine.agentId,
      amount,
      remainingCollateral: creditLine.collateralAmount,
    });

    return true;
  }

  // ==========================================================================
  // INTEREST ACCRUAL
  // ==========================================================================

  /**
   * Accrue interest on a credit line
   */
  async accrueInterest(creditLineId: string): Promise<number> {
    const creditLine = this.creditLines.get(creditLineId);
    if (!creditLine || creditLine.outstandingBalance <= 0) return 0;

    const timeSinceLastAccrual = Date.now() - creditLine.lastInterestAccrual;
    const yearFraction = timeSinceLastAccrual / (365 * 24 * 60 * 60 * 1000);

    const interest = creditLine.outstandingBalance * creditLine.interestRate * yearFraction;

    creditLine.accruedInterest += interest;
    creditLine.lastInterestAccrual = Date.now();

    // Update health factor
    creditLine.healthFactor = calculateHealthFactor(creditLine);

    return interest;
  }

  /**
   * Accrue interest on all active credit lines
   */
  async accrueAllInterest(): Promise<void> {
    for (const creditLine of this.creditLines.values()) {
      if (creditLine.status === 'active' && creditLine.outstandingBalance > 0) {
        await this.accrueInterest(creditLine.id);
      }
    }
  }

  // ==========================================================================
  // LIQUIDATION
  // ==========================================================================

  /**
   * Check if a credit line is liquidatable
   */
  checkLiquidation(creditLineId: string): LiquidationStatus {
    const creditLine = this.creditLines.get(creditLineId);
    if (!creditLine) {
      return {
        isLiquidatable: false,
        healthFactor: Infinity,
        warningLevel: 'safe',
        liquidationPenalty: 0,
      };
    }

    const healthFactor = calculateHealthFactor(creditLine);

    let warningLevel: LiquidationStatus['warningLevel'] = 'safe';
    if (healthFactor < this.liquidationThreshold) {
      warningLevel = 'liquidatable';
    } else if (healthFactor < 1.2) {
      warningLevel = 'danger';
    } else if (healthFactor < 1.5) {
      warningLevel = 'warning';
    }

    const shortfall = healthFactor < this.liquidationThreshold
      ? (creditLine.outstandingBalance * creditLine.collateralRatio) - creditLine.collateralAmount
      : undefined;

    return {
      isLiquidatable: healthFactor < this.liquidationThreshold,
      healthFactor,
      warningLevel,
      shortfall,
      liquidationPenalty: this.liquidationPenalty,
    };
  }

  /**
   * Liquidate an undercollateralized credit line
   */
  async liquidate(creditLineId: string): Promise<LiquidationResult> {
    const creditLine = this.creditLines.get(creditLineId);
    if (!creditLine) {
      return { success: false, liquidatedAmount: 0, collateralSeized: 0, penalty: 0 };
    }

    const status = this.checkLiquidation(creditLineId);
    if (!status.isLiquidatable) {
      return { success: false, liquidatedAmount: 0, collateralSeized: 0, penalty: 0 };
    }

    // Calculate liquidation amounts
    const totalDebt = creditLine.outstandingBalance + creditLine.accruedInterest;
    const penalty = totalDebt * this.liquidationPenalty;
    const collateralToSeize = Math.min(creditLine.collateralAmount, totalDebt + penalty);

    // Update credit line
    creditLine.status = 'liquidating';
    creditLine.collateralAmount -= collateralToSeize;
    creditLine.outstandingBalance = Math.max(0, totalDebt - collateralToSeize);
    creditLine.accruedInterest = 0;
    creditLine.lastActivityAt = Date.now();

    // If fully covered, mark loans as liquidated
    if (creditLine.outstandingBalance <= 0) {
      creditLine.status = 'closed';
      const loanIds = this.loansByCreditLine.get(creditLineId);
      if (loanIds) {
        for (const loanId of loanIds) {
          const loan = this.loans.get(loanId);
          if (loan && loan.status === 'active') {
            loan.status = 'liquidated';
          }
        }
      }
    } else {
      creditLine.status = 'defaulted';
    }

    // Record transaction
    const tx: TransactionRecord = {
      txHash: `0x${uuidv4().replace(/-/g, '')}`,
      blockNumber: Math.floor(Date.now() / 1000),
      timestamp: Date.now(),
      amount: collateralToSeize,
      type: 'liquidation',
      from: creditLineId,
      to: 'platform',
    };
    creditLine.transactions.push(tx);

    this.emit('credit:liquidated', {
      creditLineId,
      agentId: creditLine.agentId,
      collateralSeized: collateralToSeize,
      debtCovered: Math.min(totalDebt, collateralToSeize),
      remainingDebt: creditLine.outstandingBalance,
    });

    return {
      success: true,
      liquidatedAmount: totalDebt,
      collateralSeized: collateralToSeize,
      penalty,
      txHash: tx.txHash,
    };
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  getCreditLine(creditLineId: string): CreditLine | undefined {
    return this.creditLines.get(creditLineId);
  }

  getCreditLineByAgent(agentId: string): CreditLine | undefined {
    const creditLineId = this.creditLinesByAgent.get(agentId);
    if (!creditLineId) return undefined;
    return this.creditLines.get(creditLineId);
  }

  getLoan(loanId: string): CreditLoan | undefined {
    return this.loans.get(loanId);
  }

  getLoansByCreditLine(creditLineId: string): CreditLoan[] {
    const loanIds = this.loansByCreditLine.get(creditLineId);
    if (!loanIds) return [];

    return Array.from(loanIds)
      .map(id => this.loans.get(id))
      .filter((l): l is CreditLoan => l !== undefined);
  }

  getActiveLoans(creditLineId: string): CreditLoan[] {
    return this.getLoansByCreditLine(creditLineId).filter(l => l.status === 'active');
  }

  getAllCreditLines(): CreditLine[] {
    return Array.from(this.creditLines.values());
  }

  getActiveCreditLines(): CreditLine[] {
    return Array.from(this.creditLines.values()).filter(cl => cl.status === 'active');
  }

  getInterestRates(): Record<CreditTier, number> {
    return {
      exceptional: DEFI_CREDIT_TIER_CONFIG.exceptional.interestRate,
      excellent: DEFI_CREDIT_TIER_CONFIG.excellent.interestRate,
      good: DEFI_CREDIT_TIER_CONFIG.good.interestRate,
      fair: DEFI_CREDIT_TIER_CONFIG.fair.interestRate,
      subprime: DEFI_CREDIT_TIER_CONFIG.subprime.interestRate,
    };
  }

  getSystemStats(): {
    totalCreditLines: number;
    activeCreditLines: number;
    totalOutstanding: number;
    totalCollateral: number;
    averageHealthFactor: number;
    defaultRate: number;
  } {
    let totalOutstanding = 0;
    let totalCollateral = 0;
    let healthFactorSum = 0;
    let activeCount = 0;
    let defaultedCount = 0;

    for (const cl of this.creditLines.values()) {
      totalOutstanding += cl.outstandingBalance + cl.accruedInterest;
      totalCollateral += cl.collateralAmount;

      if (cl.status === 'active') {
        activeCount++;
        healthFactorSum += cl.healthFactor === Infinity ? 10 : cl.healthFactor;
      } else if (cl.status === 'defaulted') {
        defaultedCount++;
      }
    }

    return {
      totalCreditLines: this.creditLines.size,
      activeCreditLines: activeCount,
      totalOutstanding,
      totalCollateral,
      averageHealthFactor: activeCount > 0 ? healthFactorSum / activeCount : 0,
      defaultRate: this.creditLines.size > 0 ? defaultedCount / this.creditLines.size : 0,
    };
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  destroy(): void {
    if (this.interestAccrualTimer) {
      clearInterval(this.interestAccrualTimer);
    }
    this.removeAllListeners();
  }
}
