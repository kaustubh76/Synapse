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

// Re-export all types for convenience
export * from '@synapse/types';
