// ============================================================
// SYNAPSE LLM LAYER - TYPE DEFINITIONS
// ============================================================

// -------------------- LLM PROVIDER TYPES --------------------

export type LLMProviderId = 'openai' | 'anthropic' | 'google' | 'ollama' | 'together' | 'groq';

export interface LLMProvider {
  id: LLMProviderId;
  name: string;
  description: string;
  models: LLMModel[];
  apiType: 'openai' | 'anthropic' | 'google' | 'ollama' | 'openai-compatible';
  baseUrl: string;
  authType: 'api_key' | 'oauth' | 'none';
  status: 'online' | 'offline' | 'degraded';
  lastHealthCheck: number;
}

export interface LLMModel {
  id: string;                           // e.g., 'gpt-4-turbo'
  name: string;                         // e.g., 'GPT-4 Turbo'
  provider: LLMProviderId;

  // Capabilities
  contextWindow: number;                // Max input tokens
  maxOutputTokens: number;              // Max output tokens
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsJson: boolean;

  // Pricing (per 1M tokens in USD)
  inputPricePerMillion: number;
  outputPricePerMillion: number;

  // Performance metrics (rolling averages)
  avgLatencyMs: number;
  avgQualityScore: number;              // 0-100
  successRate: number;                  // 0-1
  totalRequests: number;

  // Categories
  tier: 'premium' | 'standard' | 'budget';
  specialties: string[];                // e.g., ['coding', 'creative', 'analysis']
}

// -------------------- LLM INTENT TYPES --------------------

export interface LLMIntentParams {
  // Input
  prompt: string;
  systemPrompt?: string;
  messages?: ChatMessage[];

  // Model Selection
  models?: string[];                    // Specific models to compare
  modelTier?: 'premium' | 'balanced' | 'budget' | 'all';
  minModels?: number;                   // Min models to query (default: 3)
  maxModels?: number;                   // Max models to query (default: 5)
  excludeModels?: string[];

  // Generation Parameters
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];

  // Comparison Settings
  compareBy?: ComparisonCriteria[];
  selectionMode?: SelectionMode;
  selectionCriteria?: SelectionCriteria;

  // Streaming
  stream?: boolean;
  streamCallback?: (chunk: StreamChunk) => void;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
}

export type ComparisonCriteria = 'cost' | 'quality' | 'latency' | 'tokens';

export type SelectionMode =
  | 'manual'                            // User chooses
  | 'cheapest'                          // Lowest cost
  | 'fastest'                           // Lowest latency
  | 'highest_quality'                   // Best quality score
  | 'best_value'                        // Quality/cost ratio
  | 'auto';                             // System decides based on criteria

export interface SelectionCriteria {
  maxCost?: number;                     // Max acceptable cost in USD
  maxLatency?: number;                  // Max acceptable latency in ms
  minQualityScore?: number;             // Min quality score (0-100)
  preferredProvider?: LLMProviderId;
}

export interface StreamChunk {
  modelId: string;
  content: string;
  isComplete: boolean;
  tokenCount: number;
  currentCost: number;
}

// -------------------- LLM EXECUTION TYPES --------------------

export interface LLMExecution {
  executionId: string;
  modelId: string;
  modelName: string;
  provider: LLMProviderId;

  // Input
  prompt: string;
  systemPrompt?: string;
  messages?: ChatMessage[];

  // Output
  response: string;
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';

  // Token Usage
  tokenUsage: TokenUsage;

  // Metrics
  latencyMs: number;
  cost: number;                         // In USD
  startTime: number;
  endTime: number;

  // Quality (filled after scoring)
  qualityScore?: number;
  qualityMetrics?: QualityMetrics;

  // Verification
  teeVerified: boolean;
  attestation?: string;
  proof?: string;

  // Status
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  error?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface QualityMetrics {
  coherence: number;                    // 0-100: Logical flow
  relevance: number;                    // 0-100: Addresses prompt
  completeness: number;                 // 0-100: Thoroughness
  accuracy: number;                     // 0-100: Factual correctness
  creativity: number;                   // 0-100: Originality
  overall: number;                      // Weighted average
}

// -------------------- COMPARISON RESULT TYPES --------------------

export interface LLMComparisonResult {
  intentId: string;
  prompt: string;
  systemPrompt?: string;

  // Timing
  startTime: number;
  endTime: number;
  totalDuration: number;

  // Results
  results: RankedLLMResult[];
  totalModelsQueried: number;
  successfulResponses: number;
  failedResponses: number;

  // Aggregated Stats
  totalCost: number;
  avgLatency: number;
  avgQuality: number;

  // Best in class
  comparison: {
    cheapest: string;                   // Model ID
    fastest: string;
    highestQuality: string;
    bestValue: string;
    recommended: string;                // Overall recommendation
  };

  // User selection
  selectedModel?: string;
  selectionReason?: string;
  selectedAt?: number;
}

export interface RankedLLMResult extends LLMExecution {
  rank: number;

  // Normalized Scores (0-1, for comparison)
  scores: {
    cost: number;                       // Lower cost = higher score
    latency: number;                    // Lower latency = higher score
    quality: number;                    // Higher quality = higher score
    overall: number;                    // Weighted combination
  };

  // Badges
  badges: ResultBadge[];
}

export type ResultBadge =
  | 'cheapest'
  | 'fastest'
  | 'highest_quality'
  | 'best_value'
  | 'recommended'
  | 'tee_verified';

// -------------------- STREAMING PAYMENT TYPES --------------------

export interface StreamingPayment {
  streamId: string;
  intentId: string;
  modelId: string;

  // Parties
  payer: string;
  payee: string;

  // Flow Rate
  tokensPerSecond: number;
  costPerToken: number;

  // Bounds
  maxAmount: number;
  depositedAmount: number;

  // State
  streamedTokens: number;
  streamedAmount: number;
  startTime: number;
  lastUpdate: number;
  pausedAt?: number;

  // Control
  status: 'active' | 'paused' | 'completed' | 'cancelled' | 'settled';
  canPause: boolean;
  pauseReason?: string;

  // Settlement
  settlementInterval: number;           // How often to settle on-chain
  lastSettlement: number;
  settledAmount: number;
  pendingAmount: number;
}

export interface StreamPaymentUpdate {
  streamId: string;
  tokens: number;
  cost: number;
  totalStreamedTokens: number;
  totalStreamedCost: number;
  timestamp: number;
}

// -------------------- CREDIT SCORE TYPES --------------------

export type CreditTier = 'subprime' | 'fair' | 'good' | 'excellent' | 'exceptional';

export interface AgentCreditProfile {
  agentId: string;
  address: string;

  // Credit Score (300-850)
  creditScore: number;
  creditTier: CreditTier;
  lastScoreUpdate: number;

  // Credit Limits
  unsecuredCreditLimit: number;
  dailySpendLimit: number;
  monthlySpendLimit: number;
  currentDailySpend: number;
  currentMonthlySpend: number;

  // Usage
  currentBalance: number;               // Outstanding credit balance
  availableCredit: number;

  // History
  totalTransactions: number;
  successfulPayments: number;
  latePayments: number;
  defaults: number;
  accountAge: number;                   // Days since first transaction

  // Factors (0-100 each)
  factors: CreditFactors;

  // Collateral
  stakedAmount: number;
  collateralRatio: number;

  // Discounts based on tier
  tierDiscount: number;
}

export interface CreditFactors {
  paymentHistory: number;               // 35% weight
  creditUtilization: number;            // 30% weight
  accountAge: number;                   // 15% weight
  creditMix: number;                    // 10% weight
  recentActivity: number;               // 10% weight
}

export const CREDIT_TIER_CONFIG: Record<CreditTier, {
  minScore: number;
  maxScore: number;
  creditLimit: number;
  rateDiscount: number;
  escrowRequired: number;
}> = {
  exceptional: { minScore: 800, maxScore: 850, creditLimit: 10000, rateDiscount: 0.20, escrowRequired: 0 },
  excellent: { minScore: 740, maxScore: 799, creditLimit: 5000, rateDiscount: 0.15, escrowRequired: 0.25 },
  good: { minScore: 670, maxScore: 739, creditLimit: 1000, rateDiscount: 0.10, escrowRequired: 0.50 },
  fair: { minScore: 580, maxScore: 669, creditLimit: 200, rateDiscount: 0, escrowRequired: 1.0 },
  subprime: { minScore: 300, maxScore: 579, creditLimit: 0, rateDiscount: -0.10, escrowRequired: 1.0 },
};

// -------------------- YIELD & STAKING TYPES --------------------

export type YieldStrategy = 'conservative' | 'balanced' | 'aggressive';

export interface YieldBearingWallet {
  agentId: string;
  address: string;

  // Balances
  balance: {
    available: number;
    staked: number;
    pending: number;
    reserved: number;
    total: number;
  };

  // Yield
  yield: {
    currentAPY: number;
    earnedTotal: number;
    earnedThisMonth: number;
    earnedToday: number;
    autoCompound: boolean;
    strategy: YieldStrategy;
    lastHarvest: number;
  };

  // Allocation
  allocation: YieldAllocation;

  // History
  transactions: WalletTransaction[];
  createdAt: number;
  lastUpdated: number;
}

export interface YieldAllocation {
  liquidityPool: number;                // % in LP
  providerStaking: number;              // % staked with providers
  creditLending: number;                // % lent to other agents
  reserve: number;                      // % kept liquid
}

export interface WalletTransaction {
  id: string;
  type: 'deposit' | 'withdraw' | 'stake' | 'unstake' | 'yield' | 'payment' | 'refund';
  amount: number;
  currency: string;
  description: string;
  timestamp: number;
  txHash?: string;
  relatedIntentId?: string;
}

export interface StakingPosition {
  id: string;
  agentId: string;
  targetId: string;                     // Provider ID or pool ID
  targetType: 'provider' | 'liquidity_pool' | 'credit_pool';
  amount: number;
  apy: number;
  startTime: number;
  lockPeriod: number;                   // Lock duration in seconds
  unlockTime: number;
  earnedRewards: number;
  status: 'active' | 'unlocking' | 'withdrawn';
}

// -------------------- MCP MONETIZATION TYPES --------------------

export type MCPPricingModel =
  | { type: 'per_call'; price: number }
  | { type: 'per_token'; inputPrice: number; outputPrice: number }
  | { type: 'per_kb'; price: number }
  | { type: 'per_minute'; price: number }
  | { type: 'subscription'; monthly: number; callLimit: number; overage: number }
  | { type: 'freemium'; freeCalls: number; paidPrice: number }
  | { type: 'tiered'; tiers: PricingTier[] };

export interface PricingTier {
  minCalls: number;
  maxCalls: number;
  pricePerCall: number;
}

export interface MCPToolPricing {
  toolName: string;
  serverId: string;
  pricingModel: MCPPricingModel;

  // Revenue Split
  revenueSplit: {
    toolCreator: number;                // % to tool creator
    serverOperator: number;             // % to server operator
    platform: number;                   // % to Synapse
  };

  // Discounts
  discounts: {
    volumeDiscounts: VolumeDiscount[];
    creditTierDiscounts: Partial<Record<CreditTier, number>>;
    daoDiscount: number;
  };

  // Stats
  totalCalls: number;
  totalRevenue: number;
  avgResponseTime: number;
}

export interface VolumeDiscount {
  minCalls: number;
  discount: number;                     // 0-1
}

export interface MCPEarningsReport {
  serverId: string;
  period: { start: number; end: number };

  // Summary
  totalEarnings: number;
  totalCalls: number;
  uniqueCallers: number;
  avgRevenuePerCall: number;

  // By Tool
  byTool: ToolEarnings[];

  // Projections
  projections: {
    daily: number;
    weekly: number;
    monthly: number;
    growthRate: number;
  };
}

export interface ToolEarnings {
  toolName: string;
  calls: number;
  earnings: number;
  avgPrice: number;
  topCallers: string[];
}

// -------------------- PLATFORM REVENUE TYPES --------------------

export interface PlatformFees {
  intentFee: number;                    // % of intent value (default: 5%)
  settlementFee: number;                // % of settlement (default: 0.1%)
  streamingFee: number;                 // % of streamed amount (default: 0.5%)
  mcpPlatformShare: number;             // % of MCP revenue (default: 30%)
  creditInterest: number;               // APR on credit (default: 12%)
}

export const DEFAULT_PLATFORM_FEES: PlatformFees = {
  intentFee: 0.05,
  settlementFee: 0.001,
  streamingFee: 0.005,
  mcpPlatformShare: 0.30,
  creditInterest: 0.12,
};

// -------------------- EVENT TYPES --------------------

export interface LLMEvent {
  type: LLMEventType;
  intentId: string;
  timestamp: number;
  data: unknown;
}

export type LLMEventType =
  | 'comparison_started'
  | 'model_execution_started'
  | 'model_execution_completed'
  | 'model_execution_failed'
  | 'stream_token'
  | 'stream_paused'
  | 'stream_resumed'
  | 'comparison_completed'
  | 'result_selected'
  | 'payment_streamed'
  | 'payment_settled';
