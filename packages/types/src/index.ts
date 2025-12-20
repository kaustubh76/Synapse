// ============================================================
// SYNAPSE INTENT NETWORK - CORE TYPE DEFINITIONS
// ============================================================

// -------------------- ENUMS --------------------

export enum IntentStatus {
  CREATED = 'CREATED',
  OPEN = 'OPEN',           // Accepting bids
  BIDDING_CLOSED = 'BIDDING_CLOSED',
  ASSIGNED = 'ASSIGNED',   // Winner selected
  EXECUTING = 'EXECUTING', // Provider working
  COMPLETED = 'COMPLETED', // Success
  FAILED = 'FAILED',       // All providers failed
  CANCELLED = 'CANCELLED', // Client cancelled
  DISPUTED = 'DISPUTED'    // Under dispute
}

export enum BidStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  FAILOVER = 'FAILOVER',   // In failover queue
  EXECUTED = 'EXECUTED',
  FAILED = 'FAILED'
}

export enum IntentCategory {
  DATA = 'data',           // Weather, prices, etc.
  COMPUTE = 'compute',     // Processing tasks
  AI = 'ai',               // LLM inference
  SEARCH = 'search',       // Web/data search
  TRANSACTION = 'transaction' // On-chain actions
}

export enum ProviderStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  BUSY = 'BUSY',
  SUSPENDED = 'SUSPENDED'
}

// -------------------- CORE TYPES --------------------

export interface Intent {
  id: string;
  parentId?: string;                    // For sub-intents
  clientAddress: string;                // Wallet address

  // Intent specification
  type: string;                         // e.g., "weather.current", "crypto.price"
  category: IntentCategory;
  params: Record<string, unknown>;      // Type-specific parameters

  // Requirements
  requirements: IntentRequirements;

  // Economics
  maxBudget: number;                    // In USDC (decimal)
  currency: string;                     // "USDC"
  escrowId?: string;

  // Timing (ms since epoch)
  createdAt: number;
  biddingDeadline: number;              // When bidding closes
  executionDeadline: number;            // When execution must complete

  // Status
  status: IntentStatus;

  // Assignment
  assignedProvider?: string;            // Winner's address
  failoverQueue: string[];              // Backup provider addresses

  // Result
  result?: IntentResult;

  // Metadata
  metadata?: Record<string, unknown>;
}

export interface IntentRequirements {
  minReputation?: number;               // Minimum provider reputation (0-5)
  requireTEE?: boolean;                 // Require TEE attestation
  preferredProviders?: string[];        // Preferred provider addresses
  excludedProviders?: string[];         // Blacklisted providers
  maxLatency?: number;                  // Max acceptable latency in ms
}

export interface IntentResult {
  data: unknown;
  providerId: string;
  executionTime: number;                // Time to execute in ms
  proof?: string;                       // ZK proof or hash
  attestation?: string;                 // TEE attestation
  settlementTx?: string;                // Payment transaction hash
  settledAmount: number;                // Amount paid
  completedAt: number;
}

// -------------------- BIDS --------------------

export interface Bid {
  id: string;
  intentId: string;
  providerAddress: string;
  providerId: string;                   // Provider's unique ID

  // Bid details
  bidAmount: number;                    // In USDC
  estimatedTime: number;                // Estimated execution time in ms
  confidence: number;                   // 0-100

  // Provider info (snapshot at bid time)
  reputationScore: number;
  teeAttested: boolean;
  capabilities: string[];

  // Scoring
  calculatedScore: number;
  rank: number;

  // Timing
  submittedAt: number;
  expiresAt: number;

  // Status
  status: BidStatus;
}

export interface BidSubmission {
  intentId: string;
  bidAmount: number;
  estimatedTime: number;
  confidence: number;
}

// -------------------- PROVIDERS --------------------

export interface Provider {
  id: string;
  address: string;                      // Wallet address

  // Profile
  name: string;
  description: string;
  capabilities: string[];               // e.g., ["weather.current", "weather.forecast"]
  endpoint: string;                     // API endpoint URL

  // Trust signals
  teeAttested: boolean;
  verificationLevel: 'none' | 'basic' | 'verified' | 'audited';

  // Reputation
  reputationScore: number;              // 0-5
  totalJobs: number;
  successfulJobs: number;
  totalEarnings: number;
  avgResponseTime: number;              // in ms

  // Staking
  stakedAmount: number;
  slashCount: number;

  // Status
  status: ProviderStatus;
  lastActiveAt: number;

  // Metadata
  metadata?: Record<string, unknown>;
}

export interface ProviderRegistration {
  name: string;
  description: string;
  capabilities: string[];
  endpoint: string;
  address: string;
}

// -------------------- PAYMENTS (x402) --------------------

export interface PaymentDetails {
  intentId: string;
  amount: number;
  currency: string;
  network: string;                      // e.g., "base", "polygon"
  recipientAddress: string;
  payerAddress: string;
  timestamp: number;
}

export interface PaymentResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  settledAmount: number;
  networkFee: number;
}

export interface EscrowDeposit {
  id: string;
  intentId: string;
  clientAddress: string;
  amount: number;
  currency: string;
  status: 'held' | 'released' | 'refunded' | 'slashed';
  createdAt: number;
  releasedAt?: number;
  releasedTo?: string;
}

// -------------------- WEBSOCKET EVENTS --------------------

export enum WSEventType {
  // Client -> Server
  SUBSCRIBE_INTENT = 'subscribe_intent',
  UNSUBSCRIBE_INTENT = 'unsubscribe_intent',
  SUBSCRIBE_PROVIDER = 'subscribe_provider',

  // Server -> Client
  INTENT_CREATED = 'intent_created',
  BID_RECEIVED = 'bid_received',
  BID_UPDATED = 'bid_updated',
  WINNER_SELECTED = 'winner_selected',
  EXECUTION_STARTED = 'execution_started',
  EXECUTION_PROGRESS = 'execution_progress',
  INTENT_COMPLETED = 'intent_completed',
  INTENT_FAILED = 'intent_failed',
  FAILOVER_TRIGGERED = 'failover_triggered',
  PAYMENT_SETTLED = 'payment_settled',

  // Provider events
  NEW_INTENT_AVAILABLE = 'new_intent_available',
  INTENT_ASSIGNED = 'intent_assigned',

  // System
  ERROR = 'error',
  CONNECTED = 'connected',
  PING = 'ping',
  PONG = 'pong'
}

export interface WSMessage<T = unknown> {
  type: WSEventType;
  payload: T;
  timestamp: number;
  correlationId?: string;
}

export interface WSBidUpdate {
  intentId: string;
  bid: Bid;
  totalBids: number;
  currentLeader: string;
}

export interface WSIntentUpdate {
  intent: Intent;
  event: WSEventType;
  metadata?: Record<string, unknown>;
}

// -------------------- API RESPONSES --------------------

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

// -------------------- CREATE INTENT REQUEST --------------------

export interface CreateIntentRequest {
  type: string;
  category: IntentCategory;
  params: Record<string, unknown>;
  maxBudget: number;
  currency?: string;
  requirements?: Partial<IntentRequirements>;
  biddingDuration?: number;             // How long to accept bids (ms)
  executionTimeout?: number;            // Max execution time (ms)
}

// -------------------- BID SCORING --------------------

export interface BidScoreWeights {
  price: number;       // Weight for price score (0-1)
  reputation: number;  // Weight for reputation (0-1)
  speed: number;       // Weight for estimated time (0-1)
  teeBonus: number;    // Multiplier for TEE attestation
}

export const DEFAULT_BID_WEIGHTS: BidScoreWeights = {
  price: 0.4,
  reputation: 0.4,
  speed: 0.1,
  teeBonus: 1.2
};

// -------------------- CAPABILITY TYPES --------------------

export const CAPABILITY_TYPES = {
  // Data capabilities
  'weather.current': 'Get current weather for a location',
  'weather.forecast': 'Get weather forecast',
  'crypto.price': 'Get cryptocurrency price',
  'crypto.history': 'Get historical crypto data',
  'news.latest': 'Get latest news articles',
  'news.search': 'Search news by topic',

  // Compute capabilities
  'compute.image': 'Process/analyze images',
  'compute.text': 'Process/analyze text',

  // AI capabilities
  'ai.chat': 'Conversational AI',
  'ai.summarize': 'Summarize content',
  'ai.translate': 'Translate text',

  // Search capabilities
  'search.web': 'Search the web',
  'search.code': 'Search code repositories'
} as const;

export type CapabilityType = keyof typeof CAPABILITY_TYPES;

// -------------------- CONSTANTS --------------------

export const SYNAPSE_CONSTANTS = {
  DEFAULT_BIDDING_DURATION: 5000,       // 5 seconds
  DEFAULT_EXECUTION_TIMEOUT: 30000,     // 30 seconds
  MIN_BID_AMOUNT: 0.0001,               // $0.0001 USDC
  MAX_BID_AMOUNT: 100,                  // $100 USDC
  FAILOVER_TIMEOUT: 2000,               // 2 seconds before failover
  MAX_FAILOVER_ATTEMPTS: 3,
  REPUTATION_PENALTY_FAILURE: 0.1,
  REPUTATION_BONUS_SUCCESS: 0.01,
  SLASH_PERCENTAGE: 0.1                 // 10% of stake
} as const;
