// ============================================================
// SYNAPSE Crossmint Type Definitions
// Types for Crossmint wallet integration
// ============================================================

/**
 * Supported blockchain networks
 */
export type CrossmintChain =
  | 'base'
  | 'base-sepolia'
  | 'ethereum'
  | 'ethereum-sepolia'
  | 'polygon'
  | 'polygon-amoy'
  | 'arbitrum'
  | 'arbitrum-sepolia'
  | 'optimism'
  | 'optimism-sepolia'
  | 'solana'
  | 'solana-devnet';

/**
 * Chain identifiers for Crossmint API
 */
export const CROSSMINT_CHAIN_IDS: Record<CrossmintChain, string> = {
  'base': 'base',
  'base-sepolia': 'base-sepolia',
  'ethereum': 'ethereum',
  'ethereum-sepolia': 'ethereum-sepolia',
  'polygon': 'polygon',
  'polygon-amoy': 'polygon-amoy',
  'arbitrum': 'arbitrum',
  'arbitrum-sepolia': 'arbitrum-sepolia',
  'optimism': 'optimism',
  'optimism-sepolia': 'optimism-sepolia',
  'solana': 'solana',
  'solana-devnet': 'solana-devnet',
};

/**
 * Wallet type
 */
export type WalletType = 'evm-smart-wallet' | 'solana-custodial-wallet';

/**
 * Crossmint API configuration
 */
export interface CrossmintConfig {
  /** API key from Crossmint dashboard */
  apiKey: string;
  /** Environment */
  environment?: 'staging' | 'production';
  /** Default chain for new wallets */
  defaultChain?: CrossmintChain;
  /** Project ID (optional) */
  projectId?: string;
}

/**
 * Wallet creation parameters
 */
export interface CreateWalletParams {
  /** Unique identifier for the wallet owner (e.g., agent ID) */
  linkedUser: string;
  /** Wallet type */
  type?: WalletType;
  /** Chain configuration */
  chain?: CrossmintChain;
  /** Email for notifications (optional) */
  email?: string;
  /** Idempotency key for duplicate prevention */
  idempotencyKey?: string;
}

/**
 * Wallet information
 */
export interface WalletInfo {
  /** Wallet ID (Crossmint internal) */
  id: string;
  /** Blockchain address */
  address: string;
  /** Chain the wallet is on */
  chain: CrossmintChain;
  /** Wallet type */
  type: WalletType;
  /** Linked user ID */
  linkedUser: string;
  /** Creation timestamp */
  createdAt: string;
  /** Last updated timestamp */
  updatedAt?: string;
}

/**
 * Token balance
 */
export interface TokenBalance {
  /** Token address (or 'native' for chain token) */
  token: string;
  /** Token symbol */
  symbol: string;
  /** Balance in smallest unit */
  balance: string;
  /** Balance formatted with decimals */
  balanceFormatted: string;
  /** Token decimals */
  decimals: number;
  /** USD value (if available) */
  usdValue?: string;
}

/**
 * Transaction parameters
 */
export interface TransactionParams {
  /** Recipient address */
  to: string;
  /** Value in native token (optional) */
  value?: string;
  /** Contract call data (optional) */
  data?: string;
  /** Gas limit (optional) */
  gasLimit?: string;
}

/**
 * Token transfer parameters
 */
export interface TokenTransferParams {
  /** Recipient address */
  to: string;
  /** Token address */
  tokenAddress: string;
  /** Amount to transfer (in token units, e.g., "0.01") */
  amount: string;
}

/**
 * Transaction result
 */
export interface TransactionResult {
  /** Transaction ID (Crossmint internal) */
  id: string;
  /** Transaction hash (on-chain) */
  txHash?: string;
  /** Transaction status */
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
  /** Chain */
  chain: CrossmintChain;
  /** Block number (if confirmed) */
  blockNumber?: number;
  /** Error message (if failed) */
  error?: string;
  /** Gas used */
  gasUsed?: string;
}

/**
 * Signature request parameters
 */
export interface SignMessageParams {
  /** Message to sign */
  message: string;
  /** Signature type */
  type?: 'personal_sign' | 'eth_signTypedData_v4';
}

/**
 * Typed data for EIP-712 signing
 */
export interface TypedDataParams {
  /** EIP-712 domain */
  domain: {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: string;
  };
  /** Type definitions */
  types: Record<string, Array<{ name: string; type: string }>>;
  /** Primary type */
  primaryType: string;
  /** Message data */
  message: Record<string, unknown>;
}

/**
 * Signature result
 */
export interface SignatureResult {
  /** The signature */
  signature: string;
  /** Signing address */
  signer: string;
}

/**
 * Crossmint API error
 */
export interface CrossmintError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Additional details */
  details?: Record<string, unknown>;
}

/**
 * API response wrapper
 */
export interface CrossmintResponse<T> {
  /** Success flag */
  success: boolean;
  /** Response data */
  data?: T;
  /** Error information */
  error?: CrossmintError;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  /** Page number (1-indexed) */
  page?: number;
  /** Items per page */
  perPage?: number;
}

/**
 * Crossmint paginated response
 */
export interface CrossmintPaginatedResponse<T> {
  /** Items on current page */
  items: T[];
  /** Total item count */
  totalCount: number;
  /** Current page */
  page: number;
  /** Items per page */
  perPage: number;
  /** Total pages */
  totalPages: number;
}

/**
 * Transaction history entry
 */
export interface TransactionHistory {
  /** Transaction ID */
  id: string;
  /** Transaction hash */
  txHash: string;
  /** From address */
  from: string;
  /** To address */
  to: string;
  /** Value transferred */
  value: string;
  /** Token (if token transfer) */
  token?: string;
  /** Status */
  status: 'pending' | 'confirmed' | 'failed';
  /** Timestamp */
  timestamp: string;
  /** Block number */
  blockNumber?: number;
}

/**
 * Webhook event types
 */
export type WebhookEventType =
  | 'wallet.created'
  | 'transaction.submitted'
  | 'transaction.confirmed'
  | 'transaction.failed';

/**
 * Webhook payload
 */
export interface WebhookPayload {
  /** Event type */
  type: WebhookEventType;
  /** Event timestamp */
  timestamp: string;
  /** Wallet ID */
  walletId: string;
  /** Event-specific data */
  data: Record<string, unknown>;
}
