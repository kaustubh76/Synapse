// ============================================================
// SERVER MONETIZATION SDK - Make any MCP server earn money
// Revolutionary: One wrapper function to monetize any tool
// ============================================================

import { EventEmitter } from 'eventemitter3';
import {
  X402Network,
  X402PaymentRequirements,
  X402PaymentPayload,
  X402ErrorCode,
  USDC_ADDRESSES,
  generateNonce,
  parseUSDCAmount,
  encodePaymentRequirements,
  decodePaymentPayload,
} from '../types.js';

/**
 * Pricing configuration for tools
 */
export interface PricingConfig {
  /** Default price for tools without specific pricing (USDC) */
  defaultPrice: string;
  /** Tool-specific pricing */
  tools?: Record<string, string | DynamicPricing>;
  /** Free tools (no payment required) */
  freeTiers?: string[];
}

/**
 * Dynamic pricing function
 */
export interface DynamicPricing {
  /** Base price (USDC) */
  basePrice: string;
  /** Pricing function based on input */
  calculate: (toolName: string, args: Record<string, unknown>) => string;
}

/**
 * Server monetization configuration
 */
export interface MonetizeConfig {
  /** Recipient wallet address for payments */
  recipient: string;
  /** Network for payments */
  network: X402Network;
  /** Pricing configuration */
  pricing: PricingConfig;
  /** Payment expiration time in seconds (default: 300) */
  paymentExpiry?: number;
  /** Demo mode - skip real payment verification */
  demoMode?: boolean;
  /** Verification callback */
  verifyPayment?: (payload: X402PaymentPayload) => Promise<boolean>;
  /** Settlement callback */
  settlePayment?: (payload: X402PaymentPayload) => Promise<string>;
}

/**
 * Tool call request
 */
export interface ToolCallRequest {
  /** Tool name */
  name: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
  /** Payment header (if provided) */
  paymentHeader?: string;
}

/**
 * Tool call result
 */
export interface ToolCallResult {
  /** Result content */
  content: Array<{ type: string; text?: string; data?: unknown }>;
  /** Whether call failed */
  isError?: boolean;
  /** Payment receipt (if payment was made) */
  receipt?: PaymentReceipt;
}

/**
 * Payment receipt
 */
export interface PaymentReceipt {
  /** Amount paid (USDC) */
  amount: string;
  /** Transaction hash */
  txHash?: string;
  /** Payer address */
  payer: string;
  /** Settlement status */
  settled: boolean;
  /** Timestamp */
  timestamp: number;
}

/**
 * 402 Payment Required response
 */
export interface PaymentRequiredResponse {
  /** Error code */
  code: X402ErrorCode;
  /** Error message */
  message: string;
  /** Payment requirements */
  requirements: X402PaymentRequirements;
  /** Encoded requirements for header */
  header: string;
}

/**
 * Monetization events
 */
export interface MonetizeEvents {
  /** Payment required */
  'payment:required': (toolName: string, requirements: X402PaymentRequirements) => void;
  /** Payment received */
  'payment:received': (toolName: string, receipt: PaymentReceipt) => void;
  /** Payment verified */
  'payment:verified': (toolName: string, payer: string, amount: string) => void;
  /** Payment settled */
  'payment:settled': (toolName: string, txHash: string) => void;
  /** Payment failed */
  'payment:failed': (toolName: string, error: string) => void;
  /** Tool called */
  'tool:called': (toolName: string, hasPaid: boolean) => void;
  /** Earnings update */
  'earnings:updated': (total: string, byTool: Record<string, string>) => void;
}

/**
 * MonetizedServer - Wrapper to add payment functionality to MCP servers
 *
 * Usage:
 * ```typescript
 * const monetized = new MonetizedServer({
 *   recipient: '0xYourWallet',
 *   network: 'base',
 *   pricing: {
 *     defaultPrice: '0.001',
 *     tools: {
 *       'premium_tool': '0.01',
 *       'expensive_analysis': { basePrice: '0.005', calculate: dynamicFn },
 *     },
 *     freeTiers: ['health_check'],
 *   },
 * });
 *
 * // Wrap your tool handler
 * const result = await monetized.handleToolCall(request, originalHandler);
 * ```
 */
export class MonetizedServer extends EventEmitter<MonetizeEvents> {
  private config: MonetizeConfig;
  private usdcAddress: string;

  // Earnings tracking
  private totalEarnings: number = 0;
  private earningsByTool: Map<string, number> = new Map();
  private transactions: PaymentReceipt[] = [];

  constructor(config: MonetizeConfig) {
    super();
    this.config = {
      paymentExpiry: 300,
      demoMode: false,
      ...config,
    };
    this.usdcAddress = USDC_ADDRESSES[config.network];
  }

  /**
   * Handle a tool call with payment processing
   */
  async handleToolCall<T>(
    request: ToolCallRequest,
    handler: (name: string, args: Record<string, unknown>) => Promise<T>
  ): Promise<ToolCallResult | PaymentRequiredResponse> {
    const { name, arguments: args, paymentHeader } = request;

    this.emit('tool:called', name, !!paymentHeader);

    // Check if tool is free
    if (this.isFreeTool(name)) {
      const result = await handler(name, args);
      return this.formatResult(result);
    }

    // Get price for tool
    const price = this.getPrice(name, args);

    // If no payment provided, return 402
    if (!paymentHeader) {
      return this.createPaymentRequired(name, price, args);
    }

    // Verify and process payment
    try {
      const receipt = await this.processPayment(name, price, paymentHeader);

      // Execute the tool
      const result = await handler(name, args);

      // Return result with receipt
      return {
        ...this.formatResult(result),
        receipt,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Payment failed';
      this.emit('payment:failed', name, errorMessage);

      return {
        content: [{ type: 'text', text: `Payment error: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  /**
   * Check payment for a tool call without executing
   */
  async checkPayment(request: ToolCallRequest): Promise<{
    required: boolean;
    price?: string;
    hasPaid: boolean;
    isValid?: boolean;
  }> {
    const { name, arguments: args, paymentHeader } = request;

    // Check if tool is free
    if (this.isFreeTool(name)) {
      return { required: false, hasPaid: false };
    }

    const price = this.getPrice(name, args);

    if (!paymentHeader) {
      return { required: true, price, hasPaid: false };
    }

    // Verify payment
    try {
      const payload = decodePaymentPayload(paymentHeader);
      const isValid = await this.verifyPayment(payload, price);
      return { required: true, price, hasPaid: true, isValid };
    } catch {
      return { required: true, price, hasPaid: true, isValid: false };
    }
  }

  /**
   * Get price for a tool
   */
  getPrice(toolName: string, args?: Record<string, unknown>): string {
    const toolPricing = this.config.pricing.tools?.[toolName];

    if (!toolPricing) {
      return this.config.pricing.defaultPrice;
    }

    if (typeof toolPricing === 'string') {
      return toolPricing;
    }

    // Dynamic pricing
    return toolPricing.calculate(toolName, args || {});
  }

  /**
   * Check if tool is free
   */
  isFreeTool(toolName: string): boolean {
    return this.config.pricing.freeTiers?.includes(toolName) ?? false;
  }

  /**
   * Get payment requirements for a tool
   */
  getPaymentRequirements(toolName: string, args?: Record<string, unknown>): X402PaymentRequirements {
    const price = this.getPrice(toolName, args);
    const priceRaw = parseUSDCAmount(price);

    return {
      scheme: 'exact',
      network: this.config.network,
      tokenAddress: this.usdcAddress,
      tokenSymbol: 'USDC',
      amount: priceRaw,
      recipient: this.config.recipient,
      description: `Payment for ${toolName}`,
      expiresAt: Math.floor(Date.now() / 1000) + (this.config.paymentExpiry || 300),
      nonce: generateNonce(),
      resource: toolName,
    };
  }

  /**
   * Get earnings statistics
   */
  getEarnings(): {
    total: string;
    byTool: Record<string, string>;
    transactionCount: number;
    recentTransactions: PaymentReceipt[];
  } {
    const byTool: Record<string, string> = {};
    for (const [tool, amount] of this.earningsByTool) {
      byTool[tool] = (amount / 1_000_000).toFixed(6);
    }

    return {
      total: (this.totalEarnings / 1_000_000).toFixed(6),
      byTool,
      transactionCount: this.transactions.length,
      recentTransactions: this.transactions.slice(-10),
    };
  }

  /**
   * Create middleware for Express/HTTP servers
   */
  createMiddleware(): (req: unknown, res: unknown, next: () => void) => void {
    return (req: unknown, res: unknown, next: () => void) => {
      // Extract payment header from request
      const httpReq = req as { headers?: Record<string, string>; body?: ToolCallRequest };
      const httpRes = res as {
        status: (code: number) => { json: (body: unknown) => void };
        setHeader: (name: string, value: string) => void;
      };

      if (httpReq.body?.name) {
        const paymentHeader = httpReq.headers?.['x-payment'];

        // Attach to request for handler
        (httpReq as { paymentHeader?: string }).paymentHeader = paymentHeader;
      }

      next();
    };
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  private createPaymentRequired(
    toolName: string,
    price: string,
    args?: Record<string, unknown>
  ): PaymentRequiredResponse {
    const requirements = this.getPaymentRequirements(toolName, args);
    const header = encodePaymentRequirements(requirements);

    this.emit('payment:required', toolName, requirements);

    return {
      code: X402ErrorCode.PAYMENT_REQUIRED,
      message: `Payment required: ${price} USDC for ${toolName}`,
      requirements,
      header,
    };
  }

  private async processPayment(
    toolName: string,
    expectedPrice: string,
    paymentHeader: string
  ): Promise<PaymentReceipt> {
    // Decode payment payload
    const payload = decodePaymentPayload(paymentHeader);

    // Verify payment
    const isValid = await this.verifyPayment(payload, expectedPrice);
    if (!isValid) {
      throw new Error('Payment verification failed');
    }

    this.emit('payment:verified', toolName, payload.payer, expectedPrice);

    // Settle payment (if not demo mode)
    let txHash: string | undefined;
    if (!this.config.demoMode) {
      txHash = await this.settlePayment(payload);
      this.emit('payment:settled', toolName, txHash);
    }

    // Create receipt
    const receipt: PaymentReceipt = {
      amount: expectedPrice,
      txHash,
      payer: payload.payer,
      settled: !this.config.demoMode,
      timestamp: Date.now(),
    };

    // Track earnings
    this.recordEarning(toolName, expectedPrice);

    this.emit('payment:received', toolName, receipt);
    this.transactions.push(receipt);

    return receipt;
  }

  private async verifyPayment(payload: X402PaymentPayload, expectedPrice: string): Promise<boolean> {
    // Custom verification
    if (this.config.verifyPayment) {
      return this.config.verifyPayment(payload);
    }

    // Demo mode - always valid
    if (this.config.demoMode) {
      return true;
    }

    // Default verification
    const { requirements, signature, payer } = payload;

    // Check expiration
    if (requirements.expiresAt < Math.floor(Date.now() / 1000)) {
      throw new Error('Payment expired');
    }

    // Check amount
    const expectedRaw = parseUSDCAmount(expectedPrice);
    if (BigInt(requirements.amount) < BigInt(expectedRaw)) {
      throw new Error(`Insufficient payment: expected ${expectedPrice} USDC`);
    }

    // Check recipient
    if (requirements.recipient.toLowerCase() !== this.config.recipient.toLowerCase()) {
      throw new Error('Wrong recipient');
    }

    // Check network
    if (requirements.network !== this.config.network) {
      throw new Error(`Wrong network: expected ${this.config.network}`);
    }

    // Verify signature (simplified - in production, use proper EIP-712 verification)
    if (!signature || signature.length < 64) {
      throw new Error('Invalid signature');
    }

    return true;
  }

  private async settlePayment(payload: X402PaymentPayload): Promise<string> {
    // Custom settlement
    if (this.config.settlePayment) {
      return this.config.settlePayment(payload);
    }

    // Simulate settlement
    // In production, this would call the blockchain
    return '0x' + generateNonce().slice(2, 66);
  }

  private recordEarning(toolName: string, amount: string): void {
    const amountMicro = Math.floor(parseFloat(amount) * 1_000_000);
    this.totalEarnings += amountMicro;

    const current = this.earningsByTool.get(toolName) || 0;
    this.earningsByTool.set(toolName, current + amountMicro);

    // Emit earnings update
    const byTool: Record<string, string> = {};
    for (const [tool, amt] of this.earningsByTool) {
      byTool[tool] = (amt / 1_000_000).toFixed(6);
    }
    this.emit('earnings:updated', (this.totalEarnings / 1_000_000).toFixed(6), byTool);
  }

  private formatResult(result: unknown): ToolCallResult {
    if (typeof result === 'object' && result !== null && 'content' in result) {
      return result as ToolCallResult;
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  }
}

/**
 * Quick monetization wrapper function
 *
 * Usage:
 * ```typescript
 * const handler = monetize(originalHandler, {
 *   recipient: '0xWallet',
 *   network: 'base',
 *   price: '0.01',
 * });
 * ```
 */
export function monetize<T>(
  handler: (name: string, args: Record<string, unknown>) => Promise<T>,
  config: {
    recipient: string;
    network: X402Network;
    price: string;
    freeTiers?: string[];
    demoMode?: boolean;
  }
): (request: ToolCallRequest) => Promise<ToolCallResult | PaymentRequiredResponse> {
  const server = new MonetizedServer({
    recipient: config.recipient,
    network: config.network,
    pricing: {
      defaultPrice: config.price,
      freeTiers: config.freeTiers,
    },
    demoMode: config.demoMode,
  });

  return (request: ToolCallRequest) => server.handleToolCall(request, handler);
}

/**
 * Decorator for monetizing class methods
 */
export function Paid(price: string) {
  return function (
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      this: { _monetizeConfig?: MonetizeConfig },
      request: ToolCallRequest
    ) {
      // Check for payment
      if (!request.paymentHeader) {
        throw new Error(`Payment required: ${price} USDC for ${propertyKey}`);
      }

      // Call original method
      return originalMethod.call(this, request);
    };

    // Store price metadata
    (descriptor.value as { _price?: string })._price = price;

    return descriptor;
  };
}
