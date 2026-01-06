/**
 * Flash Loan Manager
 *
 * Implements flash loans for AI agents - instant uncollateralized loans
 * that must be repaid within the same "transaction" (callback execution).
 *
 * Use cases:
 * - Multi-step intent execution requiring upfront capital
 * - Arbitrage between providers
 * - Refinancing positions
 *
 * Features:
 * - 0.05% fee on borrowed amount
 * - Max 50% of pool liquidity per flash loan
 * - 30 second execution timeout
 * - Atomic execution (all or nothing)
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  FlashLoan,
  FlashLoanCallback,
  FlashLoanCallbackResult,
  FlashLoanResult,
  FlashLoanAvailability,
  FLASH_LOAN_CONFIG,
} from './types.js';
import { LiquidityPoolManager } from './liquidity-pool.js';

export interface FlashLoanManagerConfig {
  liquidityPoolManager: LiquidityPoolManager;
  defaultPoolId?: string;
  feeRate?: number;
  maxPoolRatio?: number;
  maxExecutionTimeMs?: number;
}

export class FlashLoanManager extends EventEmitter {
  private activeLoans: Map<string, FlashLoan> = new Map();
  private completedLoans: FlashLoan[] = [];
  private liquidityPool: LiquidityPoolManager;
  private defaultPoolId: string;
  private feeRate: number;
  private maxPoolRatio: number;
  private maxExecutionTimeMs: number;

  // Statistics
  private totalFlashLoans: number = 0;
  private totalVolume: number = 0;
  private totalFees: number = 0;
  private failedLoans: number = 0;

  constructor(config: FlashLoanManagerConfig) {
    super();
    this.liquidityPool = config.liquidityPoolManager;
    this.defaultPoolId = config.defaultPoolId ?? 'main_pool';
    this.feeRate = config.feeRate ?? FLASH_LOAN_CONFIG.feeRate;
    this.maxPoolRatio = config.maxPoolRatio ?? FLASH_LOAN_CONFIG.maxPoolRatio;
    this.maxExecutionTimeMs = config.maxExecutionTimeMs ?? FLASH_LOAN_CONFIG.maxExecutionTimeMs;
  }

  // ==========================================================================
  // FLASH LOAN EXECUTION
  // ==========================================================================

  /**
   * Execute a flash loan
   *
   * The callback function receives the loan and must return a result
   * indicating repayment. If repayment fails, the entire operation fails.
   */
  async flash(
    borrower: string,
    borrowerAddress: string,
    amount: number,
    callback: FlashLoanCallback,
    options?: {
      purpose?: string;
      intentId?: string;
      callbackData?: string;
    }
  ): Promise<FlashLoanResult> {
    const startTime = Date.now();

    // Validate amount
    if (amount <= 0) {
      return {
        success: false,
        loanId: '',
        amount: 0,
        fee: 0,
        executionDurationMs: 0,
        error: 'Invalid amount',
      };
    }

    // Check availability
    const availability = this.checkAvailability(amount);
    if (!availability.available) {
      return {
        success: false,
        loanId: '',
        amount: 0,
        fee: 0,
        executionDurationMs: 0,
        error: `Insufficient liquidity. Max available: $${availability.maxAmount.toFixed(2)}`,
      };
    }

    // Calculate fee
    const fee = amount * this.feeRate;

    // Create loan record
    const loan: FlashLoan = {
      id: `flash_${uuidv4().slice(0, 8)}`,
      borrower,
      borrowerAddress,
      amount,
      fee,
      feeRate: this.feeRate,
      intentId: options?.intentId,
      purpose: options?.purpose ?? 'flash_loan',
      callbackData: options?.callbackData,
      borrowedAt: Date.now(),
      status: 'executing',
    };

    this.activeLoans.set(loan.id, loan);

    try {
      // Reserve funds from pool (temporarily)
      const reserved = await this.liquidityPool.borrowFromPool(this.defaultPoolId, amount);
      if (!reserved) {
        throw new Error('Failed to reserve funds from pool');
      }

      // Execute callback with timeout
      const callbackResult: FlashLoanCallbackResult = await this.executeWithTimeout<FlashLoanCallbackResult>(
        () => callback(loan),
        this.maxExecutionTimeMs
      );

      // Validate repayment
      if (!callbackResult.success) {
        throw new Error(callbackResult.error || 'Callback failed');
      }

      if (callbackResult.repaidAmount < amount + fee) {
        throw new Error(
          `Insufficient repayment. Required: $${(amount + fee).toFixed(2)}, Got: $${callbackResult.repaidAmount.toFixed(2)}`
        );
      }

      // Return funds to pool (principal + interest from fee)
      await this.liquidityPool.repayToPool(this.defaultPoolId, amount, fee);

      // Update loan status
      loan.status = 'repaid';
      loan.repaidAt = Date.now();
      loan.repaidAmount = callbackResult.repaidAmount;
      loan.profit = callbackResult.profit;
      loan.executionDurationMs = Date.now() - startTime;
      loan.txHash = `0x${uuidv4().replace(/-/g, '')}`;

      // Move to completed
      this.activeLoans.delete(loan.id);
      this.completedLoans.push(loan);

      // Keep only last 1000 completed loans
      if (this.completedLoans.length > 1000) {
        this.completedLoans = this.completedLoans.slice(-1000);
      }

      // Update statistics
      this.totalFlashLoans++;
      this.totalVolume += amount;
      this.totalFees += fee;

      this.emit('flash:executed', {
        loanId: loan.id,
        borrower,
        amount,
        fee,
        profit: callbackResult.profit,
        executionDurationMs: loan.executionDurationMs,
      });

      return {
        success: true,
        loanId: loan.id,
        amount,
        fee,
        profit: callbackResult.profit,
        executionDurationMs: loan.executionDurationMs,
        txHash: loan.txHash,
      };
    } catch (error) {
      // Flash loan failed - "revert" the transaction
      loan.status = 'defaulted';
      loan.error = error instanceof Error ? error.message : 'Unknown error';
      loan.executionDurationMs = Date.now() - startTime;

      // Return reserved funds (no interest since loan failed)
      await this.liquidityPool.repayToPool(this.defaultPoolId, amount, 0);

      // Move to completed (as failed)
      this.activeLoans.delete(loan.id);
      this.completedLoans.push(loan);

      // Update statistics
      this.failedLoans++;

      this.emit('flash:failed', {
        loanId: loan.id,
        borrower,
        amount,
        error: loan.error,
        executionDurationMs: loan.executionDurationMs,
      });

      return {
        success: false,
        loanId: loan.id,
        amount,
        fee,
        executionDurationMs: loan.executionDurationMs,
        error: loan.error,
      };
    }
  }

  /**
   * Simple flash loan for testing/demo purposes
   * Automatically handles repayment
   */
  async flashSimple(
    borrower: string,
    borrowerAddress: string,
    amount: number,
    purpose: string = 'demo'
  ): Promise<FlashLoanResult> {
    return this.flash(
      borrower,
      borrowerAddress,
      amount,
      async (loan: FlashLoan): Promise<FlashLoanCallbackResult> => {
        // Simulate some operation
        await new Promise(resolve => setTimeout(resolve, 100));

        // Auto-repay with a small profit
        const profit = amount * 0.001; // 0.1% profit

        return {
          success: true,
          repaidAmount: loan.amount + loan.fee,
          profit,
        };
      },
      { purpose }
    );
  }

  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Flash loan execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      fn()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  // ==========================================================================
  // AVAILABILITY & UTILITIES
  // ==========================================================================

  /**
   * Check flash loan availability
   */
  checkAvailability(requestedAmount?: number): FlashLoanAvailability {
    const pool = this.liquidityPool.getPool(this.defaultPoolId);
    if (!pool) {
      return {
        available: false,
        maxAmount: 0,
        feeRate: this.feeRate,
        poolUtilization: 1,
      };
    }

    const availableForBorrowing = this.liquidityPool.getAvailableForBorrowing(this.defaultPoolId);
    const maxFlashAmount = availableForBorrowing * this.maxPoolRatio;

    const available = requestedAmount
      ? requestedAmount <= maxFlashAmount
      : maxFlashAmount > 0;

    return {
      available,
      maxAmount: maxFlashAmount,
      feeRate: this.feeRate,
      poolUtilization: pool.utilizationRate,
    };
  }

  /**
   * Calculate fee for a given amount
   */
  calculateFee(amount: number): number {
    return amount * this.feeRate;
  }

  /**
   * Get a completed flash loan by ID
   */
  getFlashLoan(loanId: string): FlashLoan | undefined {
    return this.activeLoans.get(loanId) ||
      this.completedLoans.find(l => l.id === loanId);
  }

  /**
   * Get recent flash loans
   */
  getRecentLoans(limit: number = 10): FlashLoan[] {
    return this.completedLoans.slice(-limit).reverse();
  }

  /**
   * Get flash loans by borrower
   */
  getLoansByBorrower(borrower: string): FlashLoan[] {
    return this.completedLoans.filter(l => l.borrower === borrower);
  }

  /**
   * Get system statistics
   */
  getStats(): {
    totalFlashLoans: number;
    totalVolume: number;
    totalFees: number;
    failedLoans: number;
    successRate: number;
    averageLoanSize: number;
    currentAvailability: FlashLoanAvailability;
  } {
    return {
      totalFlashLoans: this.totalFlashLoans,
      totalVolume: this.totalVolume,
      totalFees: this.totalFees,
      failedLoans: this.failedLoans,
      successRate: this.totalFlashLoans > 0
        ? (this.totalFlashLoans - this.failedLoans) / this.totalFlashLoans
        : 1,
      averageLoanSize: this.totalFlashLoans > 0
        ? this.totalVolume / this.totalFlashLoans
        : 0,
      currentAvailability: this.checkAvailability(),
    };
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  destroy(): void {
    this.removeAllListeners();
  }
}

// =============================================================================
// FLASH LOAN HELPER FUNCTIONS
// =============================================================================

/**
 * Create a flash loan callback for multi-provider arbitrage
 */
export function createArbitrageCallback(
  operations: Array<{
    provider: string;
    execute: (funds: number) => Promise<number>; // Returns value received
  }>
): FlashLoanCallback {
  return async (loan: FlashLoan): Promise<FlashLoanCallbackResult> => {
    let currentFunds = loan.amount;
    let totalReceived = 0;

    try {
      for (const op of operations) {
        const received = await op.execute(currentFunds);
        totalReceived = received;
        currentFunds = received;
      }

      const profit = totalReceived - loan.amount - loan.fee;
      const repaymentNeeded = loan.amount + loan.fee;

      if (totalReceived >= repaymentNeeded) {
        return {
          success: true,
          repaidAmount: repaymentNeeded,
          profit: Math.max(0, profit),
        };
      } else {
        return {
          success: false,
          repaidAmount: totalReceived,
          error: `Arbitrage unprofitable. Needed: $${repaymentNeeded.toFixed(2)}, Got: $${totalReceived.toFixed(2)}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        repaidAmount: 0,
        error: error instanceof Error ? error.message : 'Arbitrage execution failed',
      };
    }
  };
}

/**
 * Create a flash loan callback for multi-step intent execution
 */
export function createIntentExecutionCallback(
  steps: Array<{
    name: string;
    cost: number;
    execute: () => Promise<{ success: boolean; value?: number }>;
  }>,
  expectedRevenue: number
): FlashLoanCallback {
  return async (loan: FlashLoan): Promise<FlashLoanCallbackResult> => {
    let totalCost = 0;
    let totalValue = 0;

    try {
      for (const step of steps) {
        const result = await step.execute();
        if (!result.success) {
          throw new Error(`Step "${step.name}" failed`);
        }
        totalCost += step.cost;
        totalValue += result.value || 0;
      }

      // Add expected revenue (from client payment)
      totalValue += expectedRevenue;

      const repaymentNeeded = loan.amount + loan.fee;
      const profit = totalValue - totalCost - loan.fee;

      if (totalValue >= repaymentNeeded) {
        return {
          success: true,
          repaidAmount: repaymentNeeded,
          profit: Math.max(0, profit),
        };
      } else {
        return {
          success: false,
          repaidAmount: totalValue,
          error: `Intent execution insufficient. Needed: $${repaymentNeeded.toFixed(2)}, Got: $${totalValue.toFixed(2)}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        repaidAmount: 0,
        error: error instanceof Error ? error.message : 'Intent execution failed',
      };
    }
  };
}
