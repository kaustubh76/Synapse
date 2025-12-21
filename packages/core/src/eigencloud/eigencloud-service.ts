// ============================================================
// EIGENCLOUD SERVICE
// Unified service for all Eigencloud integrations
// Combines EigenCompute, ERC-8004, TEE Attestation, and ZK Proofs
// ============================================================

import { EventEmitter } from 'eventemitter3';
import {
  EigenComputeClient,
  getEigenComputeClient,
  ExecutionResult,
  ExecutionRequest
} from './eigen-compute.js';
import {
  ERC8004RegistryClient,
  getERC8004RegistryClient,
  OnChainAgentProfile,
  AgentRegistration
} from './erc8004-registry.js';
import {
  TEEAttestationService,
  getTEEAttestationService,
  AttestationResult
} from './tee-attestation.js';
import {
  ZKProofService,
  getZKProofService,
  ZKProof,
  ZKVerificationResult
} from './zk-proofs.js';

export interface EigencloudConfig {
  // EigenCompute config
  computeApiEndpoint?: string;
  computeApiKey?: string;
  computeProjectId?: string;

  // ERC-8004 config
  registryRpcUrl?: string;
  registryAddress?: string;
  registryChainId?: number;

  // TEE/ZK config
  verifierEndpoint?: string;
  verifierApiKey?: string;

  // Global
  demoMode?: boolean;
}

export interface VerifiedExecution {
  executionResult: ExecutionResult;
  attestationResult: AttestationResult;
  zkVerificationResult: ZKVerificationResult;
  verified: boolean;
  verificationSummary: string;
}

export interface AgentVerificationStatus {
  agentId: string;
  isRegistered: boolean;
  hasTEEAttestation: boolean;
  hasValidReputation: boolean;
  reputationScore: number;
  trustModels: string[];
  verificationLevel: 'none' | 'basic' | 'standard' | 'trusted' | 'verified';
}

interface EigencloudServiceEvents {
  'execution:verified': (result: VerifiedExecution) => void;
  'agent:verified': (status: AgentVerificationStatus) => void;
  'service:ready': () => void;
  'service:error': (error: string) => void;
}

/**
 * Eigencloud Service
 *
 * Unified interface for all Eigencloud functionality:
 * - EigenCompute: TEE-based execution
 * - ERC-8004: On-chain agent identity
 * - TEE Attestation: Verification of secure execution
 * - ZK Proofs: Cryptographic proof of correct computation
 *
 * This service orchestrates all components to provide:
 * 1. Verifiable agent registration
 * 2. TEE-based intent execution
 * 3. Full verification pipeline (attestation + ZK proof)
 * 4. Agent discovery and reputation
 */
export class EigencloudService extends EventEmitter<EigencloudServiceEvents> {
  private config: EigencloudConfig;
  private computeClient: EigenComputeClient;
  private registryClient: ERC8004RegistryClient;
  private attestationService: TEEAttestationService;
  private zkProofService: ZKProofService;
  private isReady: boolean = false;

  constructor(config: EigencloudConfig = {}) {
    super();
    // Default to demo mode unless explicitly set to false
    const demoMode = config.demoMode ?? true;

    this.config = {
      ...config,
      demoMode
    };

    // Initialize all sub-services with consistent demoMode
    this.computeClient = getEigenComputeClient({
      apiEndpoint: config.computeApiEndpoint || process.env.EIGENCOMPUTE_API_URL || 'https://api.eigencloud.xyz',
      apiKey: config.computeApiKey || process.env.EIGENCLOUD_API_KEY || '',
      projectId: config.computeProjectId || process.env.EIGENCLOUD_PROJECT_ID,
      demoMode
    });

    this.registryClient = getERC8004RegistryClient({
      rpcUrl: config.registryRpcUrl || process.env.ERC8004_RPC_URL || 'https://sepolia.base.org',
      registryAddress: config.registryAddress || process.env.ERC8004_REGISTRY_ADDRESS || '0x0000000000000000000000000000000000008004',
      chainId: config.registryChainId || parseInt(process.env.ERC8004_CHAIN_ID || '84532'),
      demoMode
    });

    this.attestationService = getTEEAttestationService({
      verifierEndpoint: config.verifierEndpoint || process.env.TEE_VERIFIER_URL || 'https://verify.eigencloud.xyz',
      apiKey: config.verifierApiKey || process.env.EIGENCLOUD_API_KEY,
      demoMode
    });

    this.zkProofService = getZKProofService({
      verifierEndpoint: config.verifierEndpoint || process.env.ZK_VERIFIER_URL || 'https://verify.eigencloud.xyz',
      apiKey: config.verifierApiKey || process.env.EIGENCLOUD_API_KEY,
      demoMode
    });

    this.isReady = true;
    this.emit('service:ready');
  }

  // ============================================================
  // AGENT REGISTRATION & IDENTITY
  // ============================================================

  /**
   * Register an agent with full Eigencloud integration
   * Creates on-chain identity via ERC-8004 and optionally deploys to EigenCompute
   */
  async registerAgent(registration: AgentRegistration & {
    dockerImage?: string;
    enableTEE?: boolean;
  }): Promise<{
    profile: OnChainAgentProfile;
    dockerDigest?: string;
    deploymentId?: string;
  }> {
    // 1. Deploy to EigenCompute if docker image provided
    let dockerDigest: string | undefined;
    let deploymentId: string | undefined;

    if (registration.dockerImage && registration.enableTEE !== false) {
      const deployment = await this.computeClient.deploy(registration.dockerImage, {
        teeType: 'tdx'
      });
      dockerDigest = deployment.dockerDigest;
      deploymentId = deployment.deploymentId;
    }

    // 2. Add TEE trust model if deployed to EigenCompute
    const trustModels = registration.trustModels || [];
    if (dockerDigest) {
      trustModels.push({
        type: 'tee-attestation',
        config: { dockerDigest, deploymentId }
      });
    }

    // 3. Register on-chain via ERC-8004
    const profile = await this.registryClient.registerAgent({
      ...registration,
      trustModels
    });

    return { profile, dockerDigest, deploymentId };
  }

  /**
   * Get agent with full verification status
   */
  async getAgentWithVerification(agentId: string): Promise<{
    profile: OnChainAgentProfile | null;
    status: AgentVerificationStatus;
  }> {
    const profile = await this.registryClient.getAgent(agentId);

    const status = await this.getAgentVerificationStatus(agentId);

    return { profile, status };
  }

  /**
   * Get verification status for an agent
   */
  async getAgentVerificationStatus(agentId: string): Promise<AgentVerificationStatus> {
    const profile = await this.registryClient.getAgent(agentId);
    const reputation = await this.registryClient.getReputation(agentId);

    if (!profile) {
      return {
        agentId,
        isRegistered: false,
        hasTEEAttestation: false,
        hasValidReputation: false,
        reputationScore: 0,
        trustModels: [],
        verificationLevel: 'none'
      };
    }

    const hasTEE = profile.trustModels.some(tm => tm.type === 'tee-attestation');
    const hasZK = profile.trustModels.some(tm => tm.type === 'zk-proof');
    const reputationScore = reputation ? reputation.score / 100 : 0;
    const hasGoodReputation = reputationScore >= 3.5;

    let verificationLevel: AgentVerificationStatus['verificationLevel'] = 'basic';
    if (hasTEE && hasZK && hasGoodReputation) {
      verificationLevel = 'verified';
    } else if (hasTEE && hasGoodReputation) {
      verificationLevel = 'trusted';
    } else if (hasTEE || hasGoodReputation) {
      verificationLevel = 'standard';
    }

    const status: AgentVerificationStatus = {
      agentId,
      isRegistered: true,
      hasTEEAttestation: hasTEE,
      hasValidReputation: hasGoodReputation,
      reputationScore,
      trustModels: profile.trustModels.map(tm => tm.type),
      verificationLevel
    };

    this.emit('agent:verified', status);
    return status;
  }

  /**
   * Search for verified agents with specific capabilities
   */
  async findVerifiedAgents(options: {
    capability: string;
    minReputation?: number;
    requireTEE?: boolean;
    limit?: number;
  }): Promise<OnChainAgentProfile[]> {
    const agents = await this.registryClient.searchAgents({
      capability: options.capability,
      minReputation: options.minReputation || 3.0,
      trustModels: options.requireTEE ? ['tee-attestation'] : undefined,
      activeOnly: true,
      limit: options.limit || 10
    });

    return agents;
  }

  // ============================================================
  // VERIFIED EXECUTION
  // ============================================================

  /**
   * Execute a task in TEE with full verification
   * Returns execution result with attestation and ZK proof verification
   */
  async executeVerified(request: ExecutionRequest & {
    intentType: string;
    agentId?: string;
  }): Promise<VerifiedExecution> {
    // 1. Execute in TEE
    const executionResult = await this.computeClient.execute(request);

    // 2. Verify TEE attestation
    const attestationResult = await this.attestationService.verifyExecutionAttestation(executionResult.tee);

    // 3. Verify ZK proof
    const zkVerificationResult = await this.zkProofService.verifyExecutionProof(executionResult.proof);

    // 4. Determine overall verification status
    const verified = attestationResult.valid && zkVerificationResult.valid;

    let verificationSummary: string;
    if (verified) {
      verificationSummary = `Fully verified: TEE attestation (${attestationResult.type}) and ZK proof valid`;
    } else if (attestationResult.valid) {
      verificationSummary = `Partially verified: TEE attestation valid, ZK proof ${zkVerificationResult.error || 'failed'}`;
    } else if (zkVerificationResult.valid) {
      verificationSummary = `Partially verified: ZK proof valid, TEE attestation ${attestationResult.error || 'failed'}`;
    } else {
      verificationSummary = `Verification failed: TEE (${attestationResult.error || 'failed'}), ZK (${zkVerificationResult.error || 'failed'})`;
    }

    const result: VerifiedExecution = {
      executionResult,
      attestationResult,
      zkVerificationResult,
      verified,
      verificationSummary
    };

    this.emit('execution:verified', result);
    return result;
  }

  /**
   * Verify an existing execution result
   */
  async verifyExecution(executionResult: ExecutionResult): Promise<VerifiedExecution> {
    const attestationResult = await this.attestationService.verifyExecutionAttestation(executionResult.tee);
    const zkVerificationResult = await this.zkProofService.verifyExecutionProof(executionResult.proof);

    const verified = attestationResult.valid && zkVerificationResult.valid;

    return {
      executionResult,
      attestationResult,
      zkVerificationResult,
      verified,
      verificationSummary: verified
        ? 'Fully verified'
        : `Verification issues: TEE=${attestationResult.valid}, ZK=${zkVerificationResult.valid}`
    };
  }

  // ============================================================
  // REPUTATION & FEEDBACK
  // ============================================================

  /**
   * Submit feedback and update on-chain reputation
   */
  async submitFeedback(feedback: {
    agentId: string;
    intentId: string;
    rating: number;
    success: boolean;
    executionResult?: ExecutionResult;
    comment?: string;
  }): Promise<void> {
    // Submit to ERC-8004 reputation registry
    await this.registryClient.submitFeedback({
      agentId: feedback.agentId,
      taskId: feedback.intentId,
      rating: feedback.rating,
      success: feedback.success,
      comment: feedback.comment
    });

    // If execution result provided, submit validation
    if (feedback.executionResult) {
      const verification = await this.verifyExecution(feedback.executionResult);

      await this.registryClient.submitValidation({
        agentId: feedback.agentId,
        taskId: feedback.intentId,
        isValid: verification.verified,
        trustModel: verification.attestationResult.valid ? 'tee-attestation' : 'reputation',
        proof: verification.executionResult.proof?.zkProof
      });
    }
  }

  // ============================================================
  // DIRECT ACCESS TO SUB-SERVICES
  // ============================================================

  get compute(): EigenComputeClient {
    return this.computeClient;
  }

  get registry(): ERC8004RegistryClient {
    return this.registryClient;
  }

  get attestation(): TEEAttestationService {
    return this.attestationService;
  }

  get zkProofs(): ZKProofService {
    return this.zkProofService;
  }

  /**
   * Check if service is ready
   */
  get ready(): boolean {
    return this.isReady;
  }

  /**
   * Check if running in demo mode
   */
  get isDemoMode(): boolean {
    return this.config.demoMode ?? true;
  }

  /**
   * Get service configuration
   */
  getConfig(): EigencloudConfig {
    return { ...this.config };
  }
}

// Singleton instance
let eigencloudServiceInstance: EigencloudService | null = null;

export function getEigencloudService(config?: EigencloudConfig): EigencloudService {
  if (!eigencloudServiceInstance) {
    eigencloudServiceInstance = new EigencloudService(config);
  }
  return eigencloudServiceInstance;
}

export function resetEigencloudService(): void {
  eigencloudServiceInstance = null;
}
