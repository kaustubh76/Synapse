// ============================================================
// EIGENCLOUD INTEGRATION MODULE
// ERC-8004 Agent Identity + EigenCompute TEE + ZK Proofs
// ============================================================

export {
  EigenComputeClient,
  getEigenComputeClient,
  resetEigenComputeClient,
  type EigenComputeConfig,
  type ExecutionResult,
  type ExecutionRequest,
  type DeploymentResult
} from './eigen-compute.js';

export {
  ERC8004RegistryClient,
  getERC8004RegistryClient,
  resetERC8004RegistryClient,
  type RegistryConfig,
  type OnChainAgentProfile,
  type AgentSkill,
  type TrustModel,
  type ReputationData,
  type ValidationResponse,
  type AgentRegistration as ERC8004AgentRegistration
} from './erc8004-registry.js';

export {
  TEEAttestationService,
  getTEEAttestationService,
  resetTEEAttestationService,
  type AttestationResult,
  type AttestationConfig,
  type AttestationQuote,
  type AttestationRequest
} from './tee-attestation.js';

export {
  ZKProofService,
  getZKProofService,
  resetZKProofService,
  type ZKProof,
  type ZKVerificationResult,
  type ZKProofConfig,
  type ProofGenerationRequest,
  type ProofVerificationRequest
} from './zk-proofs.js';

export {
  EigencloudService,
  getEigencloudService,
  resetEigencloudService,
  type EigencloudConfig,
  type VerifiedExecution,
  type AgentVerificationStatus
} from './eigencloud-service.js';
