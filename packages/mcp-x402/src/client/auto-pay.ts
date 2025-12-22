// ============================================================
// CLIENT AUTO-PAY SDK - Autonomous payment for AI agents
// Revolutionary: Agents pay for tools automatically within budget
// ============================================================

import { EventEmitter } from 'eventemitter3';
import {
  X402Network,
  X402PaymentRequirements,
  X402PaymentPayload,
  decodePaymentRequirements,
  encodePaymentPayload,
  formatUSDCAmount,
  createPaymentTypedData,
} from '../types.js';
import { AgentWallet } from '../agent/wallet.js';
import { PaymentChannelManager } from '../channels/payment-channel.js';
import { AgentSafetyProtocol, SafetyTransaction } from '../safety/agent-safety.js';

/**
 * Budget configuration
 */
export interface BudgetConfig {
  /** Maximum amount per single transaction (USDC) */
  maxPerTransaction: string;
  /** Session budget limit (USDC) */
  sessionBudget: string;
  /** Auto-approve transactions under this amount (USDC) */
  autoApproveUnder: string;
  /** Daily spending limit (USDC) */
  dailyLimit?: string;
  /** Require confirmation callback for large transactions */
  requireConfirmation?: (amount: string, tool: string) => Promise<boolean>;
}

/**
 * Auto-pay configuration
 */
export interface AutoPayConfig {
  /** Agent wallet */
  wallet: AgentWallet;
  /** Network */
  network: X402Network;
  /** Budget configuration */
  budget: BudgetConfig;
  /** Enable payment channels for frequent recipients */
  usePaymentChannels?: boolean;
  /** Minimum channel deposit (USDC) */
  channelDeposit?: string;
  /** Enable safety protocol */
  enableSafety?: boolean;
  /** Demo mode */
  demoMode?: boolean;
}

/**
 * Tool call with auto-pay
 */
export interface AutoPayToolCall {
  /** Tool name */
  name: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
  /** MCP endpoint */
  endpoint: string;
  /** Expected price (if known) */
  expectedPrice?: string;
}

/**
 * Tool call result
 */
export interface AutoPayResult {
  /** Whether call succeeded */
  success: boolean;
  /** Result data */
  data?: unknown;
  /** Error message */
  error?: string;
  /** Payment made */
  payment?: {
    amount: string;
    recipient: string;
    txHash?: string;
    usedChannel: boolean;
  };
  /** Execution time (ms) */
  executionTime: number;
}

/**
 * Auto-pay events
 */
export interface AutoPayEvents {
  /** Payment initiated */
  'payment:initiated': (tool: string, amount: string) => void;
  /** Payment signed */
  'payment:signed': (tool: string, amount: string) => void;
  /** Payment completed */
  'payment:completed': (tool: string, amount: string, txHash?: string) => void;
  /** Payment failed */
  'payment:failed': (tool: string, error: string) => void;
  /** 402 received */
  '402:received': (tool: string, requirements: X402PaymentRequirements) => void;
  /** Budget warning */
  'budget:warning': (remaining: string, type: 'session' | 'daily') => void;
  /** Budget exceeded */
  'budget:exceeded': (type: 'session' | 'daily' | 'perTx') => void;
  /** Confirmation required */
  'confirmation:required': (tool: string, amount: string) => void;
  /** Safety blocked */
  'safety:blocked': (tool: string, reason: string) => void;
}

/**
 * AutoPayClient - Handles automatic payment for MCP tool calls
 *
 * Flow:
 * 1. Agent calls tool
 * 2. If 402 received, parse payment requirements
 * 3. Check budget and safety limits
 * 4. Sign payment (using wallet or channel)
 * 5. Retry request with payment
 * 6. Return result
 */
export class AutoPayClient extends EventEmitter<AutoPayEvents> {
  private wallet: AgentWallet;
  private config: AutoPayConfig;
  private channelManager?: PaymentChannelManager;
  private safety?: AgentSafetyProtocol;

  // Budget tracking
  private sessionSpent: number = 0;
  private dailySpent: number = 0;
  private dailyStart: number = this.getDayStart();

  // Statistics
  private callCount: number = 0;
  private successCount: number = 0;
  private failCount: number = 0;
  private totalSpent: number = 0;

  constructor(config: AutoPayConfig) {
    super();
    this.wallet = config.wallet;
    this.config = {
      usePaymentChannels: false,
      channelDeposit: '1',
      enableSafety: true,
      demoMode: false,
      ...config,
    };

    // Initialize payment channel manager
    if (this.config.usePaymentChannels) {
      this.channelManager = new PaymentChannelManager({
        network: config.network,
        sender: config.wallet.address,
        signer: (message) => this.signMessage(message),
      });
    }

    // Initialize safety protocol
    if (this.config.enableSafety) {
      this.safety = new AgentSafetyProtocol({
        rateLimit: {
          maxTxPerMinute: 10,
          maxValuePerMinute: config.budget.maxPerTransaction,
          cooldownPeriod: 60,
        },
        largeTransaction: {
          threshold: config.budget.autoApproveUnder,
          requireConfirmation: !!config.budget.requireConfirmation,
          delaySeconds: 0,
        },
      });

      // Forward safety events
      this.safety.on('blocked', (tx, reason) => {
        this.emit('safety:blocked', tx.resource, reason);
      });
    }
  }

  /**
   * Call a tool with automatic payment handling
   */
  async callTool(request: AutoPayToolCall): Promise<AutoPayResult> {
    const startTime = Date.now();
    this.callCount++;

    try {
      // First attempt without payment
      let result = await this.executeToolCall(request);

      // If 402 received, handle payment
      if (this.is402Response(result)) {
        const requirements = this.extractRequirements(result);
        this.emit('402:received', request.name, requirements);

        // Process payment and retry
        result = await this.handlePaymentAndRetry(request, requirements);
      }

      this.successCount++;
      return {
        success: true,
        data: result,
        executionTime: Date.now() - startTime,
      };

    } catch (error) {
      this.failCount++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Pre-check if payment would be allowed
   */
  async canPay(amount: string, tool: string, recipient: string): Promise<{
    allowed: boolean;
    reason?: string;
    requiresConfirmation: boolean;
  }> {
    const amountNum = parseFloat(amount) * 1_000_000;

    // Check per-transaction limit
    const maxPerTx = parseFloat(this.config.budget.maxPerTransaction) * 1_000_000;
    if (amountNum > maxPerTx) {
      return {
        allowed: false,
        reason: `Exceeds per-transaction limit of ${this.config.budget.maxPerTransaction} USDC`,
        requiresConfirmation: false,
      };
    }

    // Check session budget
    const sessionBudget = parseFloat(this.config.budget.sessionBudget) * 1_000_000;
    if (this.sessionSpent + amountNum > sessionBudget) {
      this.emit('budget:exceeded', 'session');
      return {
        allowed: false,
        reason: `Would exceed session budget of ${this.config.budget.sessionBudget} USDC`,
        requiresConfirmation: false,
      };
    }

    // Check daily limit
    this.resetDailyIfNeeded();
    if (this.config.budget.dailyLimit) {
      const dailyLimit = parseFloat(this.config.budget.dailyLimit) * 1_000_000;
      if (this.dailySpent + amountNum > dailyLimit) {
        this.emit('budget:exceeded', 'daily');
        return {
          allowed: false,
          reason: `Would exceed daily limit of ${this.config.budget.dailyLimit} USDC`,
          requiresConfirmation: false,
        };
      }
    }

    // Check safety protocol
    if (this.safety) {
      const safetyTx: SafetyTransaction = {
        id: `check_${Date.now()}`,
        timestamp: Date.now(),
        sender: this.wallet.address,
        recipient,
        amount,
        resource: tool,
      };

      const safetyResult = this.safety.check(safetyTx);
      if (!safetyResult.allowed) {
        return {
          allowed: false,
          reason: safetyResult.reason,
          requiresConfirmation: false,
        };
      }

      if (safetyResult.requiresConfirmation) {
        return {
          allowed: true,
          requiresConfirmation: true,
        };
      }
    }

    // Check if requires confirmation
    const autoApprove = parseFloat(this.config.budget.autoApproveUnder) * 1_000_000;
    const requiresConfirmation = amountNum > autoApprove && !!this.config.budget.requireConfirmation;

    return {
      allowed: true,
      requiresConfirmation,
    };
  }

  /**
   * Get spending statistics
   */
  getStats(): {
    sessionSpent: string;
    dailySpent: string;
    totalSpent: string;
    sessionRemaining: string;
    dailyRemaining: string;
    callCount: number;
    successRate: number;
  } {
    this.resetDailyIfNeeded();

    const sessionBudget = parseFloat(this.config.budget.sessionBudget) * 1_000_000;
    const dailyLimit = this.config.budget.dailyLimit
      ? parseFloat(this.config.budget.dailyLimit) * 1_000_000
      : Infinity;

    return {
      sessionSpent: (this.sessionSpent / 1_000_000).toFixed(6),
      dailySpent: (this.dailySpent / 1_000_000).toFixed(6),
      totalSpent: (this.totalSpent / 1_000_000).toFixed(6),
      sessionRemaining: ((sessionBudget - this.sessionSpent) / 1_000_000).toFixed(6),
      dailyRemaining: dailyLimit === Infinity
        ? 'unlimited'
        : ((dailyLimit - this.dailySpent) / 1_000_000).toFixed(6),
      callCount: this.callCount,
      successRate: this.callCount > 0 ? this.successCount / this.callCount : 0,
    };
  }

  /**
   * Reset session spending
   */
  resetSession(): void {
    this.sessionSpent = 0;
  }

  /**
   * Get active payment channels
   */
  getChannels(): Array<{
    id: string;
    recipient: string;
    remaining: string;
    paymentCount: number;
  }> {
    if (!this.channelManager) return [];

    return this.channelManager.getActiveChannels().map(channel => ({
      id: channel.id,
      recipient: channel.info.recipient,
      remaining: channel.remainingCapacity,
      paymentCount: channel.payments.length,
    }));
  }

  /**
   * Close all payment channels
   */
  async closeAllChannels(): Promise<void> {
    if (this.channelManager) {
      await this.channelManager.closeAll();
    }
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  private async handlePaymentAndRetry(
    request: AutoPayToolCall,
    requirements: X402PaymentRequirements
  ): Promise<unknown> {
    const amount = formatUSDCAmount(requirements.amount);
    const recipient = requirements.recipient;

    // Check if payment is allowed
    const canPayResult = await this.canPay(amount, request.name, recipient);
    if (!canPayResult.allowed) {
      throw new Error(canPayResult.reason || 'Payment not allowed');
    }

    // Check if confirmation required
    if (canPayResult.requiresConfirmation && this.config.budget.requireConfirmation) {
      this.emit('confirmation:required', request.name, amount);
      const confirmed = await this.config.budget.requireConfirmation(amount, request.name);
      if (!confirmed) {
        throw new Error('Payment not confirmed by user');
      }
    }

    this.emit('payment:initiated', request.name, amount);

    // Sign payment
    let paymentPayload: X402PaymentPayload;
    let usedChannel = false;

    if (this.channelManager && this.shouldUseChannel(recipient)) {
      // Use payment channel
      const channel = await this.channelManager.getOrCreateChannel(
        recipient,
        this.config.channelDeposit || '1'
      );
      const payment = await channel.pay(amount, request.name);

      paymentPayload = {
        requirements,
        signature: payment.signature,
        payer: this.wallet.address,
      };
      usedChannel = true;
    } else {
      // Direct payment
      const { signature } = await this.wallet.signPayment({
        recipient,
        amount,
        resource: request.name,
        reason: `Payment for ${request.name}`,
        nonce: requirements.nonce,
        expiry: requirements.expiresAt,
      });

      paymentPayload = {
        requirements,
        signature,
        payer: this.wallet.address,
      };
    }

    this.emit('payment:signed', request.name, amount);

    // Track spending
    this.recordSpending(amount);

    // Record in safety protocol
    if (this.safety) {
      this.safety.recordTransaction({
        id: `tx_${Date.now()}`,
        timestamp: Date.now(),
        sender: this.wallet.address,
        recipient,
        amount,
        resource: request.name,
      }, true);
    }

    // Retry with payment
    const result = await this.executeToolCallWithPayment(request, paymentPayload);

    this.emit('payment:completed', request.name, amount, undefined);

    return result;
  }

  private async executeToolCall(request: AutoPayToolCall): Promise<unknown> {
    // Simulate MCP tool call
    // In production, this would use the actual MCP client

    // For demo, simulate a 402 response 50% of the time for paid tools
    if (!this.config.demoMode) {
      // Real implementation would call the endpoint
      throw new Error('Not implemented: real MCP calls');
    }

    // Demo mode: simulate 402 for all calls
    return {
      error: {
        code: 402,
        message: 'Payment Required',
        data: {
          requirements: {
            scheme: 'exact',
            network: this.config.network,
            tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
            tokenSymbol: 'USDC',
            amount: request.expectedPrice
              ? (parseFloat(request.expectedPrice) * 1_000_000).toString()
              : '10000', // $0.01 default
            recipient: '0x1234567890123456789012345678901234567890',
            description: `Payment for ${request.name}`,
            expiresAt: Math.floor(Date.now() / 1000) + 300,
            nonce: '0x' + Math.random().toString(16).slice(2).padStart(64, '0'),
            resource: request.name,
          },
        },
      },
    };
  }

  private async executeToolCallWithPayment(
    request: AutoPayToolCall,
    payment: X402PaymentPayload
  ): Promise<unknown> {
    // In production, this would call the endpoint with the X-Payment header
    const paymentHeader = encodePaymentPayload(payment);

    if (!this.config.demoMode) {
      throw new Error('Not implemented: real MCP calls');
    }

    // Demo mode: simulate success
    return {
      content: [{ type: 'text', text: `Result for ${request.name}` }],
      receipt: {
        amount: formatUSDCAmount(payment.requirements.amount),
        settled: true,
      },
    };
  }

  private is402Response(response: unknown): boolean {
    if (typeof response !== 'object' || response === null) return false;

    const resp = response as { error?: { code?: number } };
    return resp.error?.code === 402;
  }

  private extractRequirements(response: unknown): X402PaymentRequirements {
    const resp = response as {
      error?: {
        data?: {
          requirements?: X402PaymentRequirements;
          header?: string;
        };
      };
    };

    if (resp.error?.data?.requirements) {
      return resp.error.data.requirements;
    }

    if (resp.error?.data?.header) {
      return decodePaymentRequirements(resp.error.data.header);
    }

    throw new Error('Could not extract payment requirements from 402 response');
  }

  private shouldUseChannel(recipient: string): boolean {
    // Use channel for frequent recipients
    // In production, would check history
    return false; // Disabled by default
  }

  private recordSpending(amount: string): void {
    const amountNum = parseFloat(amount) * 1_000_000;
    this.sessionSpent += amountNum;
    this.dailySpent += amountNum;
    this.totalSpent += amountNum;

    // Check for warnings
    const sessionBudget = parseFloat(this.config.budget.sessionBudget) * 1_000_000;
    const sessionRemaining = sessionBudget - this.sessionSpent;
    if (sessionRemaining < sessionBudget * 0.1) {
      this.emit('budget:warning', (sessionRemaining / 1_000_000).toFixed(6), 'session');
    }

    if (this.config.budget.dailyLimit) {
      const dailyLimit = parseFloat(this.config.budget.dailyLimit) * 1_000_000;
      const dailyRemaining = dailyLimit - this.dailySpent;
      if (dailyRemaining < dailyLimit * 0.1) {
        this.emit('budget:warning', (dailyRemaining / 1_000_000).toFixed(6), 'daily');
      }
    }
  }

  private getDayStart(): number {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }

  private resetDailyIfNeeded(): void {
    const currentDayStart = this.getDayStart();
    if (currentDayStart > this.dailyStart) {
      this.dailyStart = currentDayStart;
      this.dailySpent = 0;
    }
  }

  private async signMessage(message: string): Promise<string> {
    // Use wallet to sign (simplified)
    const typedData = createPaymentTypedData({
      scheme: 'exact',
      network: this.config.network,
      tokenAddress: '0x',
      tokenSymbol: 'USDC',
      amount: '0',
      recipient: '0x',
      description: message,
      expiresAt: 0,
      nonce: '0x',
    });

    // In production, use proper signing
    return '0x' + Buffer.from(message).toString('hex').padStart(130, '0');
  }
}

/**
 * Create an auto-pay client with simple configuration
 */
export async function createAutoPayClient(config: {
  privateKey?: string;
  network: X402Network;
  maxPerTransaction: string;
  sessionBudget: string;
  autoApproveUnder?: string;
  demoMode?: boolean;
}): Promise<AutoPayClient> {
  const wallet = await AgentWallet.create({
    network: config.network,
    privateKey: config.privateKey,
  });

  return new AutoPayClient({
    wallet,
    network: config.network,
    budget: {
      maxPerTransaction: config.maxPerTransaction,
      sessionBudget: config.sessionBudget,
      autoApproveUnder: config.autoApproveUnder || config.maxPerTransaction,
    },
    demoMode: config.demoMode,
  });
}
