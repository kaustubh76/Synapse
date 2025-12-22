// ============================================================
// MCP x402 TYPES
// Types for x402 payment protocol integration with MCP
// ============================================================

/**
 * Supported blockchain networks for x402 payments
 */
export type X402Network = 'base' | 'base-sepolia';

/**
 * Payment scheme for x402
 */
export type X402PaymentScheme = 'exact' | 'upto';

/**
 * USDC token addresses by network
 */
export const USDC_ADDRESSES: Record<X402Network, string> = {
  'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
};

/**
 * Chain IDs by network
 */
export const CHAIN_IDS: Record<X402Network, number> = {
  'base': 8453,
  'base-sepolia': 84532,
};

/**
 * x402 Payment Requirements
 * Sent in WWW-Authenticate or X-Payment header when 402 is returned
 */
export interface X402PaymentRequirements {
  /** Payment scheme: 'exact' or 'upto' */
  scheme: X402PaymentScheme;
  /** Blockchain network */
  network: X402Network;
  /** Token contract address (USDC) */
  tokenAddress: string;
  /** Token symbol */
  tokenSymbol: string;
  /** Amount in token's smallest unit (6 decimals for USDC) */
  amount: string;
  /** Recipient wallet address */
  recipient: string;
  /** Human-readable description */
  description: string;
  /** Payment expiration timestamp */
  expiresAt: number;
  /** Unique nonce for this payment request */
  nonce: string;
  /** Optional: Resource being purchased */
  resource?: string;
}

/**
 * x402 Payment Payload
 * Sent by client to prove payment
 */
export interface X402PaymentPayload {
  /** Original payment requirements */
  requirements: X402PaymentRequirements;
  /** EIP-712 signature authorizing the payment */
  signature: string;
  /** Payer's wallet address */
  payer: string;
  /** Optional: Transaction hash if already settled */
  txHash?: string;
}

/**
 * MCP Tool pricing configuration
 */
export interface MCPToolPricing {
  /** Tool name */
  tool: string;
  /** Price in USDC (e.g., "0.001" = 0.1 cents) */
  price: string;
  /** Optional: Price in smallest unit (micro-USDC) */
  priceRaw?: string;
  /** Optional: Description override */
  description?: string;
}

/**
 * MCP x402 Server configuration
 */
export interface MCPx402ServerConfig {
  /** Recipient wallet address for payments */
  recipient: string;
  /** Network for payments */
  network: X402Network;
  /** Default price for tools without specific pricing */
  defaultPrice: string;
  /** Tool-specific pricing */
  toolPricing?: MCPToolPricing[];
  /** Demo mode - skip real payment verification */
  demoMode?: boolean;
  /** Payment expiration time in seconds (default: 300) */
  paymentExpiry?: number;
  /** Thirdweb secret key for payment verification */
  thirdwebSecretKey?: string;
}

/**
 * MCP x402 Client configuration
 */
export interface MCPx402ClientConfig {
  /** Payer wallet address */
  payerAddress: string;
  /** Private key or signer function for signing payments */
  signer: string | ((message: string) => Promise<string>);
  /** Network for payments */
  network: X402Network;
  /** Maximum auto-approve amount per tool call (in USDC) */
  maxAutoApprove?: string;
  /** Budget limit for session (in USDC) */
  sessionBudget?: string;
  /** Demo mode - use demo payments */
  demoMode?: boolean;
}

/**
 * Payment verification result
 */
export interface X402VerificationResult {
  /** Whether payment is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Payer address */
  payer?: string;
  /** Amount paid */
  amount?: string;
  /** Transaction hash if settled */
  txHash?: string;
}

/**
 * MCP x402 Tool Call with payment
 */
export interface MCPx402ToolCall {
  /** Tool name */
  name: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
  /** Payment payload */
  payment?: X402PaymentPayload;
}

/**
 * MCP x402 Tool Result
 */
export interface MCPx402ToolResult {
  /** Tool execution result */
  content: Array<{
    type: string;
    text?: string;
    data?: unknown;
  }>;
  /** Whether execution failed */
  isError?: boolean;
  /** Payment receipt */
  receipt?: {
    /** Amount paid */
    amount: string;
    /** Transaction hash */
    txHash?: string;
    /** Settlement status */
    settled: boolean;
  };
}

/**
 * x402 Error codes for MCP
 */
export enum X402ErrorCode {
  /** Payment required but not provided */
  PAYMENT_REQUIRED = 402001,
  /** Payment signature invalid */
  INVALID_SIGNATURE = 402002,
  /** Payment expired */
  PAYMENT_EXPIRED = 402003,
  /** Insufficient payment amount */
  INSUFFICIENT_AMOUNT = 402004,
  /** Wrong network */
  WRONG_NETWORK = 402005,
  /** Settlement failed */
  SETTLEMENT_FAILED = 402006,
}

/**
 * EIP-712 typed data for x402 payment authorization
 */
export interface X402TypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
  };
  types: {
    PaymentAuthorization: Array<{
      name: string;
      type: string;
    }>;
  };
  primaryType: 'PaymentAuthorization';
  message: {
    recipient: string;
    amount: string;
    token: string;
    nonce: string;
    expiry: number;
    resource: string;
  };
}

/**
 * Helper to create EIP-712 typed data for payment
 */
export function createPaymentTypedData(
  requirements: X402PaymentRequirements
): X402TypedData {
  return {
    domain: {
      name: 'x402',
      version: '1',
      chainId: CHAIN_IDS[requirements.network],
    },
    types: {
      PaymentAuthorization: [
        { name: 'recipient', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'token', type: 'address' },
        { name: 'nonce', type: 'bytes32' },
        { name: 'expiry', type: 'uint256' },
        { name: 'resource', type: 'string' },
      ],
    },
    primaryType: 'PaymentAuthorization',
    message: {
      recipient: requirements.recipient,
      amount: requirements.amount,
      token: requirements.tokenAddress,
      nonce: requirements.nonce,
      expiry: requirements.expiresAt,
      resource: requirements.resource || requirements.description,
    },
  };
}

/**
 * Parse USDC amount to smallest unit
 * @param amount Amount in USDC (e.g., "0.001")
 * @returns Amount in micro-USDC (e.g., "1000")
 */
export function parseUSDCAmount(amount: string): string {
  const num = parseFloat(amount);
  return Math.floor(num * 1_000_000).toString();
}

/**
 * Format micro-USDC to human-readable
 * @param microAmount Amount in micro-USDC
 * @returns Amount in USDC (e.g., "0.001")
 */
export function formatUSDCAmount(microAmount: string): string {
  const num = parseInt(microAmount, 10);
  return (num / 1_000_000).toFixed(6);
}

/**
 * Generate a unique nonce for payment
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Encode payment requirements to base64 for header
 */
export function encodePaymentRequirements(requirements: X402PaymentRequirements): string {
  return Buffer.from(JSON.stringify(requirements)).toString('base64');
}

/**
 * Decode payment requirements from base64 header
 */
export function decodePaymentRequirements(encoded: string): X402PaymentRequirements {
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
}

/**
 * Encode payment payload to base64 for header
 */
export function encodePaymentPayload(payload: X402PaymentPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Decode payment payload from base64 header
 */
export function decodePaymentPayload(encoded: string): X402PaymentPayload {
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
}
