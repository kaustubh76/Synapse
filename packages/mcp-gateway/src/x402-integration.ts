// ============================================================
// MCP GATEWAY x402 INTEGRATION
// Connects the MCP Gateway with the x402 payment protocol
// ============================================================

import { EventEmitter } from 'events';
import type { MCPRequest, MCPResponse } from './types.js';

// x402 Types (matching @synapse/mcp-x402)
interface X402PaymentRequirements {
  scheme: 'exact' | 'upto';
  network: 'base' | 'base-sepolia';
  tokenAddress: string;
  tokenSymbol: string;
  amount: string;
  recipient: string;
  description: string;
  expiresAt: number;
  nonce: string;
  resource?: string;
}

interface X402PaymentPayload {
  requirements: X402PaymentRequirements;
  signature: string;
  payer: string;
  txHash?: string;
}

interface PaymentReceipt {
  amount: string;
  txHash?: string;
  payer: string;
  settled: boolean;
  timestamp: number;
}

/**
 * Tool pricing configuration
 */
export interface ToolPricing {
  /** Tool name */
  tool: string;
  /** Price in USDC */
  price: string;
  /** Whether this tool is free */
  free?: boolean;
}

/**
 * x402 Integration configuration
 */
export interface X402IntegrationConfig {
  /** Enable x402 payments */
  enabled: boolean;
  /** Recipient wallet address */
  recipient: string;
  /** Network */
  network: 'base' | 'base-sepolia';
  /** Default price for tools */
  defaultPrice: string;
  /** Tool-specific pricing */
  toolPricing?: ToolPricing[];
  /** Free tools */
  freeTiers?: string[];
  /** Demo mode (skip verification) */
  demoMode?: boolean;
  /** Payment expiry in seconds */
  paymentExpiry?: number;
}

/**
 * x402 Integration events
 */
export interface X402IntegrationEvents {
  'payment:required': (tool: string, requirements: X402PaymentRequirements) => void;
  'payment:received': (tool: string, receipt: PaymentReceipt) => void;
  'payment:verified': (tool: string, payer: string, amount: string) => void;
  'payment:failed': (tool: string, error: string) => void;
}

// USDC addresses
const USDC_ADDRESSES: Record<string, string> = {
  'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
};

/**
 * X402Integration - Adds x402 payment support to MCP Gateway
 */
export class X402Integration extends EventEmitter {
  private config: X402IntegrationConfig;
  private earnings: Map<string, number> = new Map();
  private transactions: PaymentReceipt[] = [];

  constructor(config: X402IntegrationConfig) {
    super();
    this.config = {
      paymentExpiry: 300,
      demoMode: false,
      ...config,
    };
  }

  /**
   * Check if a tool requires payment
   */
  requiresPayment(toolName: string): boolean {
    if (!this.config.enabled) return false;
    if (this.config.freeTiers?.includes(toolName)) return false;

    const toolConfig = this.config.toolPricing?.find(t => t.tool === toolName);
    if (toolConfig?.free) return false;

    return true;
  }

  /**
   * Get price for a tool
   */
  getPrice(toolName: string): string {
    const toolConfig = this.config.toolPricing?.find(t => t.tool === toolName);
    return toolConfig?.price || this.config.defaultPrice;
  }

  /**
   * Create payment requirements for a tool
   */
  createPaymentRequirements(toolName: string): X402PaymentRequirements {
    const price = this.getPrice(toolName);
    const priceRaw = Math.floor(parseFloat(price) * 1_000_000).toString();

    const requirements: X402PaymentRequirements = {
      scheme: 'exact',
      network: this.config.network,
      tokenAddress: USDC_ADDRESSES[this.config.network],
      tokenSymbol: 'USDC',
      amount: priceRaw,
      recipient: this.config.recipient,
      description: `Payment for ${toolName}`,
      expiresAt: Math.floor(Date.now() / 1000) + (this.config.paymentExpiry || 300),
      nonce: this.generateNonce(),
      resource: toolName,
    };

    this.emit('payment:required', toolName, requirements);
    return requirements;
  }

  /**
   * Create 402 Payment Required response
   */
  create402Response(requestId: string | number, toolName: string): MCPResponse {
    const requirements = this.createPaymentRequirements(toolName);
    const price = this.getPrice(toolName);

    return {
      jsonrpc: '2.0',
      id: requestId,
      error: {
        code: 402,
        message: `Payment required: ${price} USDC for ${toolName}`,
        data: {
          x402: true,
          requirements,
          header: Buffer.from(JSON.stringify(requirements)).toString('base64'),
        },
      },
    };
  }

  /**
   * Verify a payment from request headers
   */
  async verifyPayment(
    paymentHeader: string,
    toolName: string
  ): Promise<{ valid: boolean; receipt?: PaymentReceipt; error?: string }> {
    try {
      // Decode payment payload
      const payload = JSON.parse(
        Buffer.from(paymentHeader, 'base64').toString('utf-8')
      ) as X402PaymentPayload;

      // Demo mode - always valid
      if (this.config.demoMode) {
        const receipt = this.createReceipt(payload, toolName);
        return { valid: true, receipt };
      }

      // Verify payment
      const expectedPrice = this.getPrice(toolName);
      const expectedRaw = Math.floor(parseFloat(expectedPrice) * 1_000_000).toString();

      // Check amount
      if (BigInt(payload.requirements.amount) < BigInt(expectedRaw)) {
        return { valid: false, error: `Insufficient payment: expected ${expectedPrice} USDC` };
      }

      // Check expiration
      if (payload.requirements.expiresAt < Math.floor(Date.now() / 1000)) {
        return { valid: false, error: 'Payment expired' };
      }

      // Check recipient
      if (payload.requirements.recipient.toLowerCase() !== this.config.recipient.toLowerCase()) {
        return { valid: false, error: 'Wrong recipient' };
      }

      // Check network
      if (payload.requirements.network !== this.config.network) {
        return { valid: false, error: `Wrong network: expected ${this.config.network}` };
      }

      // Verify signature (simplified - in production use proper EIP-712)
      if (!payload.signature || payload.signature.length < 64) {
        return { valid: false, error: 'Invalid signature' };
      }

      // Create receipt
      const receipt = this.createReceipt(payload, toolName);
      this.emit('payment:verified', toolName, payload.payer, expectedPrice);

      return { valid: true, receipt };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('payment:failed', toolName, errorMessage);
      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Process tool call with payment verification
   */
  async processToolCall(
    request: MCPRequest,
    paymentHeader: string | undefined,
    executeHandler: () => Promise<MCPResponse>
  ): Promise<MCPResponse> {
    const params = request.params as { name?: string } | undefined;
    const toolName = params?.name || 'unknown';

    // Check if payment required
    if (!this.requiresPayment(toolName)) {
      return executeHandler();
    }

    // No payment provided
    if (!paymentHeader) {
      return this.create402Response(request.id, toolName);
    }

    // Verify payment
    const verification = await this.verifyPayment(paymentHeader, toolName);
    if (!verification.valid) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: 402,
          message: verification.error || 'Payment verification failed',
          data: { x402: true },
        },
      };
    }

    // Execute the tool
    const response = await executeHandler();

    // Attach receipt to response
    if (verification.receipt && response.result) {
      (response.result as Record<string, unknown>)._x402 = {
        receipt: verification.receipt,
      };
    }

    this.emit('payment:received', toolName, verification.receipt!);

    return response;
  }

  /**
   * Get earnings statistics
   */
  getEarnings(): {
    total: string;
    byTool: Record<string, string>;
    transactionCount: number;
  } {
    let total = 0;
    const byTool: Record<string, string> = {};

    for (const [tool, amount] of this.earnings) {
      byTool[tool] = (amount / 1_000_000).toFixed(6);
      total += amount;
    }

    return {
      total: (total / 1_000_000).toFixed(6),
      byTool,
      transactionCount: this.transactions.length,
    };
  }

  /**
   * Get x402 protocol methods for MCP
   */
  getX402Methods(): Array<{
    method: string;
    handler: (request: MCPRequest) => Promise<MCPResponse>;
  }> {
    return [
      {
        method: 'x402/getPrice',
        handler: async (request: MCPRequest) => {
          const params = request.params as { tool?: string } | undefined;
          const toolName = params?.tool;

          if (!toolName) {
            return {
              jsonrpc: '2.0',
              id: request.id,
              error: { code: -32602, message: 'Missing tool parameter' },
            };
          }

          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              tool: toolName,
              price: this.getPrice(toolName),
              network: this.config.network,
              recipient: this.config.recipient,
              requiresPayment: this.requiresPayment(toolName),
            },
          };
        },
      },
      {
        method: 'x402/getEarnings',
        handler: async (request: MCPRequest) => {
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: this.getEarnings(),
          };
        },
      },
      {
        method: 'x402/listPricing',
        handler: async (request: MCPRequest) => {
          const pricing = this.config.toolPricing || [];
          const freeTiers = this.config.freeTiers || [];

          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              defaultPrice: this.config.defaultPrice,
              tools: pricing,
              freeTiers,
              network: this.config.network,
              recipient: this.config.recipient,
            },
          };
        },
      },
    ];
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  private createReceipt(payload: X402PaymentPayload, toolName: string): PaymentReceipt {
    const amount = (parseInt(payload.requirements.amount, 10) / 1_000_000).toFixed(6);

    const receipt: PaymentReceipt = {
      amount,
      txHash: payload.txHash,
      payer: payload.payer,
      settled: !!payload.txHash,
      timestamp: Date.now(),
    };

    // Track earnings
    const amountMicro = parseInt(payload.requirements.amount, 10);
    const current = this.earnings.get(toolName) || 0;
    this.earnings.set(toolName, current + amountMicro);

    this.transactions.push(receipt);

    return receipt;
  }

  private generateNonce(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

/**
 * Create x402 integration with default config
 */
export function createX402Integration(config?: Partial<X402IntegrationConfig>): X402Integration {
  return new X402Integration({
    enabled: true,
    recipient: process.env.X402_RECIPIENT || '0x0000000000000000000000000000000000000000',
    network: (process.env.X402_NETWORK as 'base' | 'base-sepolia') || 'base-sepolia',
    defaultPrice: process.env.X402_DEFAULT_PRICE || '0.001',
    demoMode: process.env.X402_DEMO_MODE === 'true',
    ...config,
  });
}

/**
 * Singleton instance
 */
let x402Instance: X402Integration | null = null;

export function getX402Integration(): X402Integration {
  if (!x402Instance) {
    x402Instance = createX402Integration();
  }
  return x402Instance;
}
