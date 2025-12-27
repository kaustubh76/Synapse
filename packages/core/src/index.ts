// ============================================================
// SYNAPSE CORE - Main Exports
// ============================================================

// Intent Engine
export {
  IntentEngine,
  getIntentEngine,
  resetIntentEngine
} from './intent-engine.js';

// Bid Scorer
export {
  BidScorer,
  formatScore,
  getScoreColor
} from './bid-scorer.js';

// Provider Registry
export {
  ProviderRegistry,
  getProviderRegistry,
  resetProviderRegistry
} from './provider-registry.js';

// x402 Payment Middleware
export {
  x402Middleware,
  x402DynamicMiddleware,
  createPaymentHeader,
  simulateX402Payment,
  type X402Config,
  type X402PaymentHeader
} from './x402-middleware.js';

// Failover Manager
export {
  FailoverManager,
  getFailoverManager,
  resetFailoverManager,
  type ProviderHealth,
  type FailoverEvent
} from './failover-manager.js';

// Intent Decomposer
export {
  IntentDecomposer,
  getIntentDecomposer,
  resetIntentDecomposer,
  type SubIntent,
  type DecompositionPlan,
  type DecompositionRule
} from './intent-decomposer.js';

// Agent Identity Registry (ERC-8004 compatible)
export {
  AgentIdentityRegistry,
  getAgentIdentityRegistry,
  resetAgentIdentityRegistry,
  VerificationLevel,
  type AgentProfile,
  type AgentRegistration,
  type FeedbackSubmission
} from './agent-identity.js';

// Escrow Manager
export {
  EscrowManager,
  getEscrowManager,
  resetEscrowManager,
  EscrowStatus,
  type Escrow,
  type EscrowDeposit,
  type EscrowRelease
} from './escrow-manager.js';

// Dispute Resolver
export {
  DisputeResolver,
  getDisputeResolver,
  resetDisputeResolver,
  DisputeStatus,
  DisputeReason,
  type Dispute,
  type DisputeEvidence,
  type DisputeOpenRequest
} from './dispute-resolver.js';

// x402 Payment Integration (Real x402 protocol with thirdweb)
// Renamed exports to avoid conflict with legacy x402Middleware
export {
  x402Middleware as x402ProductionMiddleware,
  x402DynamicMiddleware as x402ProductionDynamicMiddleware,
  x402RouterMiddleware,
  hasValidPayment,
  getPaymentDetails,
  type X402Request
} from './x402/x402-express-middleware.js';

export {
  ThirdwebFacilitator,
  LocalFacilitator,
  createThirdwebFacilitator,
  createLocalFacilitator,
  getFacilitator,
  getDefaultFacilitator,
  resetFacilitator
} from './x402/x402-facilitator.js';

export {
  X402Client,
  createX402Client,
  createDemoX402Client
} from './x402/x402-client.js';

export {
  type X402Network,
  type X402PaymentRequirements,
  type X402PaymentPayload,
  type X402VerificationResult,
  type X402SettlementResult,
  type X402FacilitatorConfig,
  type X402MiddlewareConfig as X402ProductionConfig,
  type X402Facilitator,
  USDC_ADDRESSES,
  NETWORK_CHAIN_IDS,
  X402_HEADERS,
  encodePaymentRequirements,
  decodePaymentPayload,
  parseUSDCAmount,
  formatUSDCAmount,
  generateNonce
} from './x402/x402-types.js';

// Payment Service (orchestrates x402 + escrow)
export {
  PaymentService,
  createPaymentService,
  getPaymentService,
  resetPaymentService,
  type PaymentServiceConfig,
  type IntentPayment,
  type PaymentSettlement,
  type EscrowEntry
} from './payment-service.js';

// Eigencloud Integration (ERC-8004 + EigenCompute + TEE + ZK)
export {
  EigencloudService,
  getEigencloudService,
  resetEigencloudService,
  type EigencloudConfig,
  type VerifiedExecution,
  type AgentVerificationStatus
} from './eigencloud/eigencloud-service.js';

export {
  EigenComputeClient,
  getEigenComputeClient,
  resetEigenComputeClient,
  type EigenComputeConfig,
  type ExecutionResult,
  type ExecutionRequest,
  type DeploymentResult
} from './eigencloud/eigen-compute.js';

export {
  ERC8004RegistryClient,
  getERC8004RegistryClient,
  resetERC8004RegistryClient,
  type RegistryConfig,
  type OnChainAgentProfile,
  type AgentSkill,
  type TrustModel,
  type ReputationData,
  type ValidationResponse
} from './eigencloud/erc8004-registry.js';

export {
  TEEAttestationService,
  getTEEAttestationService,
  resetTEEAttestationService,
  type AttestationConfig,
  type AttestationResult,
  type AttestationQuote
} from './eigencloud/tee-attestation.js';

export {
  ZKProofService,
  getZKProofService,
  resetZKProofService,
  type ZKProofConfig,
  type ZKProof,
  type ZKVerificationResult
} from './eigencloud/zk-proofs.js';

// LLM Layer (Multi-Model Comparison, Credit Scores, Streaming Payments, MCP Monetization)
export * from './llm/index.js';

// MCP Layer (Tool Intent Bridge for MCP-based bidding)
export * from './mcp/index.js';

// Real Tool Providers (Weather, Crypto, News APIs)
export * from './tools/index.js';

// Re-export all types for convenience
export * from '@synapse/types';
