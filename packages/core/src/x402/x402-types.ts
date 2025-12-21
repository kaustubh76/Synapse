// ============================================================
// SYNAPSE x402 Type Definitions
// Core types for x402 payment protocol
// ============================================================

/**
 * Supported blockchain networks for x402 payments
 */
export type X402Network =
  | 'base'
  | 'base-sepolia'
  | 'ethereum'
  | 'ethereum-sepolia'
  | 'polygon'
  | 'polygon-amoy'
  | 'arbitrum'
  | 'arbitrum-sepolia'
  | 'optimism'
  | 'optimism-sepolia';

/**
 * Network chain IDs
 */
export const NETWORK_CHAIN_IDS: Record<X402Network, number> = {
  'base': 8453,
  'base-sepolia': 84532,
  'ethereum': 1,
  'ethereum-sepolia': 11155111,
  'polygon': 137,
  'polygon-amoy': 80002,
  'arbitrum': 42161,
  'arbitrum-sepolia': 421614,
  'optimism': 10,
  'optimism-sepolia': 11155420,
};

/**
 * USDC contract addresses by network
 */
export const USDC_ADDRESSES: Record<X402Network, string> = {
  'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  'ethereum': '0xA0b86a33E6176cE9E3e61B3bAa7c11fA06B1c5c6',
  'ethereum-sepolia': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  'polygon': '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  'polygon-amoy': '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
  'arbitrum': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  'arbitrum-sepolia': '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  'optimism': '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  'optimism-sepolia': '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
};

/**
 * x402 Payment scheme types
 */
export type X402Scheme = 'exact' | 'upto';

/**
 * x402 Payment requirements (402 response)
 */
export interface X402PaymentRequirements {
  /** Payment scheme */
  scheme: X402Scheme;
  /** Blockchain network */
  network: X402Network;
  /** Payment token address */
  tokenAddress: string;
  /** Token symbol (e.g., 'USDC') */
  tokenSymbol: string;
  /** Required amount (as string for precision) */
  amount: string;
  /** Recipient wallet address */
  recipient: string;
  /** Human-readable description */
  description?: string;
  /** Payment deadline (Unix timestamp ms) */
  expiresAt: number;
  /** Nonce for replay protection */
  nonce?: string;
  /** Extra metadata */
  extra?: Record<string, unknown>;
}

/**
 * x402 Payment payload (submitted by client)
 */
export interface X402PaymentPayload {
  /** Payment scheme used */
  scheme: X402Scheme;
  /** Network for the payment */
  network: X402Network;
  /** Signature authorizing transfer */
  signature: string;
  /** Authorization payload */
  authorization: {
    /** Payer address */
    from: string;
    /** Recipient address */
    to: string;
    /** Token address */
    token: string;
    /** Amount authorized */
    amount: string;
    /** Valid after timestamp */
    validAfter: number;
    /** Valid before timestamp */
    validBefore: number;
    /** Nonce */
    nonce: string;
  };
}

/**
 * x402 Payment verification result
 */
export interface X402VerificationResult {
  /** Whether the payment is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Verified amount */
  amount?: string;
  /** Payer address */
  from?: string;
  /** Recipient address */
  to?: string;
  /** Token address */
  token?: string;
  /** Network */
  network?: X402Network;
}

/**
 * x402 Settlement result
 */
export interface X402SettlementResult {
  /** Whether settlement succeeded */
  success: boolean;
  /** Transaction hash */
  txHash?: string;
  /** Block number */
  blockNumber?: number;
  /** Settlement status */
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
  /** Error message if failed */
  error?: string;
  /** Gas used */
  gasUsed?: string;
  /** Effective gas price */
  effectiveGasPrice?: string;
}

/**
 * x402 Facilitator configuration
 */
export interface X402FacilitatorConfig {
  /** Thirdweb client ID (for client-side) */
  clientId?: string;
  /** Thirdweb secret key (for server-side) */
  secretKey?: string;
  /** Server wallet address for settlements */
  serverWalletAddress: string;
  /** Default network */
  defaultNetwork?: X402Network;
  /** When to consider payment complete */
  waitUntil?: 'simulated' | 'submitted' | 'confirmed';
  /** Demo mode (simulates payments) */
  demoMode?: boolean;
}

/**
 * x402 Middleware configuration
 */
export interface X402MiddlewareConfig {
  /** Price in token units (e.g., "0.01" for $0.01 USDC) */
  price: string;
  /** Network for payment */
  network: X402Network;
  /** Token address (defaults to USDC) */
  tokenAddress?: string;
  /** Token symbol */
  tokenSymbol?: string;
  /** Recipient wallet address */
  recipient: string;
  /** Description of the paid resource */
  description?: string;
  /** Custom facilitator instance */
  facilitator?: X402Facilitator;
  /** Demo mode */
  demoMode?: boolean;
}

/**
 * x402 Facilitator interface
 */
export interface X402Facilitator {
  /** Verify a payment payload */
  verify(payload: X402PaymentPayload, requirements: X402PaymentRequirements): Promise<X402VerificationResult>;
  /** Settle a verified payment */
  settle(payload: X402PaymentPayload, requirements: X402PaymentRequirements): Promise<X402SettlementResult>;
  /** Get supported payment methods */
  supported(options?: { chainId?: number; tokenAddress?: string }): Promise<SupportedMethod[]>;
}

/**
 * Supported payment method
 */
export interface SupportedMethod {
  network: X402Network;
  chainId: number;
  tokenAddress: string;
  tokenSymbol: string;
  scheme: X402Scheme;
}

/**
 * x402 HTTP headers
 */
export const X402_HEADERS = {
  /** Payment requirements header (402 response) */
  PAYMENT_REQUIRED: 'X-Payment',
  /** Payment payload header (request with payment) */
  PAYMENT: 'X-Payment',
  /** Payment response header (success response) */
  PAYMENT_RESPONSE: 'X-Payment-Response',
} as const;

/**
 * Encode payment requirements to base64
 */
export function encodePaymentRequirements(requirements: X402PaymentRequirements): string {
  return Buffer.from(JSON.stringify(requirements)).toString('base64');
}

/**
 * Decode payment requirements from base64
 */
export function decodePaymentRequirements(encoded: string): X402PaymentRequirements | null {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

/**
 * Encode payment payload to base64
 */
export function encodePaymentPayload(payload: X402PaymentPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Decode payment payload from base64
 */
export function decodePaymentPayload(encoded: string): X402PaymentPayload | null {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

/**
 * Generate a random nonce
 */
export function generateNonce(): string {
  return `0x${Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('')}`;
}

/**
 * Parse price string to wei-like units (6 decimals for USDC)
 */
export function parseUSDCAmount(amount: string): bigint {
  const [whole, decimal = ''] = amount.split('.');
  const paddedDecimal = decimal.padEnd(6, '0').slice(0, 6);
  return BigInt(whole + paddedDecimal);
}

/**
 * Format wei-like units to human readable (6 decimals for USDC)
 */
export function formatUSDCAmount(amount: bigint): string {
  const str = amount.toString().padStart(7, '0');
  const whole = str.slice(0, -6) || '0';
  const decimal = str.slice(-6);
  return `${whole}.${decimal}`;
}
