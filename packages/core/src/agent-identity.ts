// ============================================================
// SYNAPSE Agent Identity System
// ERC-8004 compatible agent registration and verification
// Integrated with Eigencloud services
// ============================================================

import { EventEmitter } from 'eventemitter3';
import { nanoid } from 'nanoid';
import {
  getEigencloudService,
  EigencloudService,
  type VerifiedExecution,
  type AgentVerificationStatus
} from './eigencloud';
import { type OnChainAgentProfile } from './eigencloud/erc8004-registry';
import { type ExecutionResult } from './eigencloud/eigen-compute';
import { type AttestationResult } from './eigencloud/tee-attestation';

export enum VerificationLevel {
  UNVERIFIED = 0,
  BASIC = 1,        // Email verified
  STANDARD = 2,     // Code audit passed
  TRUSTED = 3,      // TEE attested
  VERIFIED = 4      // Full verification (TEE + audit + track record)
}

export interface AgentProfile {
  // Core Identity
  agentId: string;
  walletAddress: string;       // Crossmint wallet address
  ownerAddress?: string;       // Human owner (optional)

  // Metadata
  name: string;
  description: string;
  capabilities: string[];      // e.g., ["weather.current", "crypto.price"]
  mcpEndpoint?: string;        // MCP server URL
  apiEndpoint?: string;        // Direct API URL

  // Trust Signals
  teeAttestation: boolean;
  dockerDigest?: string;       // Code hash for verification
  verificationLevel: VerificationLevel;

  // Reputation
  reputationScore: number;     // 0-5.0
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  totalEarnings: number;       // In USDC
  avgResponseTime: number;     // Milliseconds

  // Staking
  stakedAmount: number;        // In USDC
  slashCount: number;

  // Status
  isActive: boolean;
  registeredAt: number;
  lastActiveAt: number;
}

export interface AgentRegistration {
  name: string;
  description: string;
  capabilities: string[];
  walletAddress: string;
  ownerAddress?: string;
  mcpEndpoint?: string;
  apiEndpoint?: string;
  teeAttestation?: boolean;
  dockerDigest?: string;
  initialStake?: number;
}

export interface FeedbackSubmission {
  agentId: string;
  intentId: string;
  rating: number;              // 1-5
  success: boolean;
  responseTime: number;
  comment?: string;
}

interface AgentIdentityEvents {
  'agent:registered': (profile: AgentProfile) => void;
  'agent:updated': (profile: AgentProfile) => void;
  'agent:deactivated': (agentId: string) => void;
  'reputation:updated': (agentId: string, oldScore: number, newScore: number) => void;
  'stake:deposited': (agentId: string, amount: number) => void;
  'stake:slashed': (agentId: string, amount: number, reason: string) => void;
  'verification:upgraded': (agentId: string, level: VerificationLevel) => void;
}

/**
 * Agent Identity Registry
 *
 * Manages agent registration, identity verification, and reputation tracking.
 * Fully integrated with Eigencloud ERC-8004 on-chain registry.
 *
 * Features:
 * - On-chain agent identity via ERC-8004
 * - TEE attestation verification via EigenCompute
 * - ZK proof verification for executions
 * - Reputation tracking synced with on-chain data
 */
export class AgentIdentityRegistry extends EventEmitter<AgentIdentityEvents> {
  private agents: Map<string, AgentProfile> = new Map();
  private agentsByWallet: Map<string, string> = new Map();
  private agentsByCapability: Map<string, Set<string>> = new Map();
  private eigencloud: EigencloudService;
  private useOnChain: boolean;

  constructor(options?: { useOnChain?: boolean }) {
    super();
    this.eigencloud = getEigencloudService();
    this.useOnChain = options?.useOnChain ?? !this.eigencloud.isDemoMode;
  }

  /**
   * Register a new agent
   */
  registerAgent(registration: AgentRegistration): AgentProfile {
    // Check for duplicate wallet
    if (this.agentsByWallet.has(registration.walletAddress)) {
      throw new Error(`Agent already registered for wallet ${registration.walletAddress}`);
    }

    const agentId = `agent_${nanoid(12)}`;
    const now = Date.now();

    const profile: AgentProfile = {
      agentId,
      walletAddress: registration.walletAddress,
      ownerAddress: registration.ownerAddress,
      name: registration.name,
      description: registration.description,
      capabilities: registration.capabilities,
      mcpEndpoint: registration.mcpEndpoint,
      apiEndpoint: registration.apiEndpoint,
      teeAttestation: registration.teeAttestation || false,
      dockerDigest: registration.dockerDigest,
      verificationLevel: registration.teeAttestation
        ? VerificationLevel.TRUSTED
        : VerificationLevel.BASIC,
      reputationScore: 3.0,    // Start with neutral reputation
      totalJobs: 0,
      successfulJobs: 0,
      failedJobs: 0,
      totalEarnings: 0,
      avgResponseTime: 0,
      stakedAmount: registration.initialStake || 0,
      slashCount: 0,
      isActive: true,
      registeredAt: now,
      lastActiveAt: now
    };

    this.agents.set(agentId, profile);
    this.agentsByWallet.set(registration.walletAddress, agentId);

    // Index by capabilities
    for (const cap of registration.capabilities) {
      if (!this.agentsByCapability.has(cap)) {
        this.agentsByCapability.set(cap, new Set());
      }
      this.agentsByCapability.get(cap)!.add(agentId);
    }

    this.emit('agent:registered', profile);
    return profile;
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentProfile | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get agent by wallet address
   */
  getAgentByWallet(walletAddress: string): AgentProfile | undefined {
    const agentId = this.agentsByWallet.get(walletAddress);
    if (!agentId) return undefined;
    return this.agents.get(agentId);
  }

  /**
   * Find agents by capability
   */
  findAgentsByCapability(capability: string): AgentProfile[] {
    const agentIds = this.agentsByCapability.get(capability);
    if (!agentIds) return [];

    return Array.from(agentIds)
      .map(id => this.agents.get(id))
      .filter((a): a is AgentProfile => a !== undefined && a.isActive);
  }

  /**
   * Find agents matching intent type
   */
  findAgentsForIntent(intentType: string): AgentProfile[] {
    // Check exact match
    let agents = this.findAgentsByCapability(intentType);

    // If no exact match, try prefix match (e.g., "weather" for "weather.current")
    if (agents.length === 0) {
      const prefix = intentType.split('.')[0];
      const allAgents = Array.from(this.agents.values()).filter(a => a.isActive);
      agents = allAgents.filter(a =>
        a.capabilities.some(cap => cap.startsWith(prefix) || cap === prefix)
      );
    }

    return agents;
  }

  /**
   * Update agent profile
   */
  updateAgent(agentId: string, updates: Partial<AgentProfile>): AgentProfile {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    // Don't allow changing core identity fields
    const { agentId: _, walletAddress, registeredAt, ...allowedUpdates } = updates;

    const updatedProfile = { ...agent, ...allowedUpdates, lastActiveAt: Date.now() };
    this.agents.set(agentId, updatedProfile);

    // Update capability index if changed
    if (updates.capabilities) {
      // Remove old indexes
      for (const cap of agent.capabilities) {
        this.agentsByCapability.get(cap)?.delete(agentId);
      }
      // Add new indexes
      for (const cap of updates.capabilities) {
        if (!this.agentsByCapability.has(cap)) {
          this.agentsByCapability.set(cap, new Set());
        }
        this.agentsByCapability.get(cap)!.add(agentId);
      }
    }

    this.emit('agent:updated', updatedProfile);
    return updatedProfile;
  }

  /**
   * Submit feedback and update reputation
   */
  submitFeedback(feedback: FeedbackSubmission): void {
    const agent = this.agents.get(feedback.agentId);
    if (!agent) throw new Error(`Agent ${feedback.agentId} not found`);

    const oldScore = agent.reputationScore;

    // Update job counts
    agent.totalJobs++;
    if (feedback.success) {
      agent.successfulJobs++;
    } else {
      agent.failedJobs++;
    }

    // Update average response time (exponential moving average)
    const alpha = 0.1;
    agent.avgResponseTime = agent.avgResponseTime === 0
      ? feedback.responseTime
      : agent.avgResponseTime * (1 - alpha) + feedback.responseTime * alpha;

    // Calculate new reputation score
    // Base: success rate (60%) + rating (30%) + response time bonus (10%)
    const successRate = agent.successfulJobs / agent.totalJobs;
    const normalizedRating = feedback.rating / 5;

    // Response time bonus: faster = better (max 1.0 for < 500ms)
    const responseBonus = Math.max(0, 1 - feedback.responseTime / 5000);

    const newScore = Math.min(5, Math.max(0,
      successRate * 3 +          // Up to 3.0 from success rate
      normalizedRating * 1.5 +   // Up to 1.5 from ratings
      responseBonus * 0.5        // Up to 0.5 from speed
    ));

    // Smooth update (don't swing too fast)
    agent.reputationScore = agent.reputationScore * 0.9 + newScore * 0.1;

    agent.lastActiveAt = Date.now();
    this.agents.set(feedback.agentId, agent);

    if (Math.abs(agent.reputationScore - oldScore) > 0.01) {
      this.emit('reputation:updated', feedback.agentId, oldScore, agent.reputationScore);
    }
  }

  /**
   * Record job completion for an agent
   */
  recordJobCompletion(
    agentId: string,
    success: boolean,
    earnings: number,
    responseTime: number
  ): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.totalJobs++;
    if (success) {
      agent.successfulJobs++;
      agent.totalEarnings += earnings;
    } else {
      agent.failedJobs++;
    }

    // Update average response time
    const alpha = 0.1;
    agent.avgResponseTime = agent.avgResponseTime === 0
      ? responseTime
      : agent.avgResponseTime * (1 - alpha) + responseTime * alpha;

    agent.lastActiveAt = Date.now();
    this.agents.set(agentId, agent);
  }

  /**
   * Deposit stake for an agent
   */
  depositStake(agentId: string, amount: number): void {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    agent.stakedAmount += amount;
    this.agents.set(agentId, agent);

    // Upgrade verification level if meeting stake requirement
    if (agent.stakedAmount >= 10 && agent.verificationLevel < VerificationLevel.STANDARD) {
      agent.verificationLevel = VerificationLevel.STANDARD;
      this.emit('verification:upgraded', agentId, VerificationLevel.STANDARD);
    }

    this.emit('stake:deposited', agentId, amount);
  }

  /**
   * Slash agent stake (for failures/disputes)
   */
  slashStake(agentId: string, amount: number, reason: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const slashAmount = Math.min(amount, agent.stakedAmount);
    agent.stakedAmount -= slashAmount;
    agent.slashCount++;

    // Reputation penalty for slashing
    agent.reputationScore = Math.max(0, agent.reputationScore - 0.2);

    // Downgrade verification if too many slashes
    if (agent.slashCount >= 3 && agent.verificationLevel > VerificationLevel.BASIC) {
      agent.verificationLevel = VerificationLevel.BASIC;
    }

    this.agents.set(agentId, agent);
    this.emit('stake:slashed', agentId, slashAmount, reason);
  }

  /**
   * Deactivate an agent
   */
  deactivateAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.isActive = false;
    this.agents.set(agentId, agent);
    this.emit('agent:deactivated', agentId);
  }

  /**
   * Get all active agents
   */
  getActiveAgents(): AgentProfile[] {
    return Array.from(this.agents.values()).filter(a => a.isActive);
  }

  /**
   * Get top agents by reputation
   */
  getTopAgents(limit = 10): AgentProfile[] {
    return Array.from(this.agents.values())
      .filter(a => a.isActive)
      .sort((a, b) => b.reputationScore - a.reputationScore)
      .slice(0, limit);
  }

  /**
   * Get agent statistics
   */
  getStats(): {
    totalAgents: number;
    activeAgents: number;
    totalJobs: number;
    totalEarnings: number;
    avgReputation: number;
  } {
    const agents = Array.from(this.agents.values());
    const activeAgents = agents.filter(a => a.isActive);

    return {
      totalAgents: agents.length,
      activeAgents: activeAgents.length,
      totalJobs: agents.reduce((sum, a) => sum + a.totalJobs, 0),
      totalEarnings: agents.reduce((sum, a) => sum + a.totalEarnings, 0),
      avgReputation: activeAgents.length > 0
        ? activeAgents.reduce((sum, a) => sum + a.reputationScore, 0) / activeAgents.length
        : 0
    };
  }

  /**
   * Verify TEE attestation for an agent using Eigencloud
   */
  async verifyTEEAttestation(agentId: string, attestation: string): Promise<AttestationResult> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return {
        valid: false,
        type: 'unknown',
        enclaveId: '',
        measurements: {},
        timestamp: Date.now(),
        expiresAt: 0,
        error: `Agent ${agentId} not found`
      };
    }

    // Use Eigencloud TEE attestation service
    const result = await this.eigencloud.attestation.verifyAttestation({
      quote: {
        raw: attestation,
        type: 'tdx'
      },
      expectedMeasurement: agent.dockerDigest
    });

    if (result.valid) {
      agent.teeAttestation = true;
      if (agent.verificationLevel < VerificationLevel.TRUSTED) {
        agent.verificationLevel = VerificationLevel.TRUSTED;
        this.emit('verification:upgraded', agentId, VerificationLevel.TRUSTED);
      }
      this.agents.set(agentId, agent);
    }

    return result;
  }

  /**
   * Verify execution result with full Eigencloud verification
   * Includes TEE attestation and ZK proof verification
   */
  async verifyExecution(agentId: string, executionResult: ExecutionResult): Promise<VerifiedExecution> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Use unified Eigencloud verification
    const verification = await this.eigencloud.verifyExecution(executionResult);

    // Update agent's TEE status if attestation is valid
    if (verification.attestationResult.valid && !agent.teeAttestation) {
      agent.teeAttestation = true;
      if (agent.verificationLevel < VerificationLevel.TRUSTED) {
        agent.verificationLevel = VerificationLevel.TRUSTED;
        this.emit('verification:upgraded', agentId, VerificationLevel.TRUSTED);
      }
      this.agents.set(agentId, agent);
    }

    // If fully verified (TEE + ZK), upgrade to VERIFIED level
    if (verification.verified && agent.verificationLevel < VerificationLevel.VERIFIED) {
      if (agent.reputationScore >= 4.0 && agent.totalJobs >= 10) {
        agent.verificationLevel = VerificationLevel.VERIFIED;
        this.emit('verification:upgraded', agentId, VerificationLevel.VERIFIED);
        this.agents.set(agentId, agent);
      }
    }

    return verification;
  }

  /**
   * Get agent verification status from Eigencloud
   */
  async getAgentVerificationStatus(agentId: string): Promise<AgentVerificationStatus> {
    return this.eigencloud.getAgentVerificationStatus(agentId);
  }

  /**
   * Execute and verify a task for an agent
   * Uses EigenCompute TEE for execution and verifies result
   */
  async executeVerified(agentId: string, request: {
    dockerImage: string;
    input: Record<string, unknown>;
    intentType: string;
    timeout?: number;
  }): Promise<VerifiedExecution> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Execute in TEE with full verification
    const result = await this.eigencloud.executeVerified({
      dockerImage: request.dockerImage,
      dockerDigest: agent.dockerDigest,
      input: request.input,
      timeout: request.timeout,
      intentType: request.intentType,
      agentId
    });

    // Update agent verification status
    if (result.verified) {
      agent.teeAttestation = true;
      if (agent.verificationLevel < VerificationLevel.TRUSTED) {
        agent.verificationLevel = VerificationLevel.TRUSTED;
        this.emit('verification:upgraded', agentId, VerificationLevel.TRUSTED);
      }
      this.agents.set(agentId, agent);
    }

    return result;
  }

  /**
   * Register agent on-chain via ERC-8004
   * Returns both local profile and on-chain profile
   */
  async registerAgentOnChain(registration: AgentRegistration & {
    dockerImage?: string;
    agentJsonUrl?: string;
  }): Promise<{ local: AgentProfile; onChain: OnChainAgentProfile }> {
    // Register locally first
    const localProfile = this.registerAgent(registration);

    // Then register on-chain via Eigencloud
    const onChainResult = await this.eigencloud.registerAgent({
      name: registration.name,
      description: registration.description,
      version: '1.0.0',
      capabilities: registration.capabilities,
      skills: registration.capabilities.map(cap => ({
        id: cap,
        name: cap.replace('.', ' ').replace(/^\w/, c => c.toUpperCase()),
        description: `Capability: ${cap}`,
        inputSchema: {},
        outputSchema: {}
      })),
      walletAddress: registration.walletAddress,
      agentJsonUrl: registration.agentJsonUrl || `https://synapse.network/agents/${localProfile.agentId}/agent.json`,
      mcpEndpoint: registration.mcpEndpoint,
      apiEndpoint: registration.apiEndpoint,
      dockerImage: registration.dockerImage,
      enableTEE: registration.teeAttestation
    });

    // Update local profile with on-chain data
    if (onChainResult.dockerDigest) {
      localProfile.dockerDigest = onChainResult.dockerDigest;
      localProfile.teeAttestation = true;
      localProfile.verificationLevel = VerificationLevel.TRUSTED;
      this.agents.set(localProfile.agentId, localProfile);
    }

    return {
      local: localProfile,
      onChain: onChainResult.profile
    };
  }

  /**
   * Find verified agents for an intent type
   * Uses Eigencloud ERC-8004 registry for discovery
   */
  async findVerifiedAgentsForIntent(intentType: string, options?: {
    minReputation?: number;
    requireTEE?: boolean;
    limit?: number;
  }): Promise<AgentProfile[]> {
    // First check local cache
    const localAgents = this.findAgentsForIntent(intentType);

    if (localAgents.length > 0) {
      // Filter by options
      let filtered = localAgents;
      if (options?.minReputation) {
        filtered = filtered.filter(a => a.reputationScore >= options.minReputation!);
      }
      if (options?.requireTEE) {
        filtered = filtered.filter(a => a.teeAttestation);
      }
      if (options?.limit) {
        filtered = filtered.slice(0, options.limit);
      }
      return filtered;
    }

    // If no local agents, query on-chain
    const onChainAgents = await this.eigencloud.findVerifiedAgents({
      capability: intentType,
      minReputation: options?.minReputation,
      requireTEE: options?.requireTEE,
      limit: options?.limit
    });

    // Convert to local profiles
    return onChainAgents.map(oca => this.onChainToLocalProfile(oca));
  }

  /**
   * Sync local agent with on-chain data
   */
  async syncWithOnChain(agentId: string): Promise<AgentProfile | null> {
    const agent = this.agents.get(agentId);
    if (!agent) return null;

    const { profile: onChain, status } = await this.eigencloud.getAgentWithVerification(agentId);

    if (onChain) {
      // Update local profile with on-chain data
      agent.teeAttestation = status.hasTEEAttestation;
      agent.verificationLevel = this.statusToVerificationLevel(status.verificationLevel);

      // Sync reputation
      const onChainRep = await this.eigencloud.registry.getReputation(agentId);
      if (onChainRep) {
        agent.reputationScore = onChainRep.score / 100; // Convert from 0-500 to 0-5
      }

      this.agents.set(agentId, agent);
      this.emit('agent:updated', agent);
    }

    return agent;
  }

  /**
   * Get the Eigencloud service instance
   */
  getEigencloud(): EigencloudService {
    return this.eigencloud;
  }

  // Helper: Convert on-chain profile to local profile
  private onChainToLocalProfile(onChain: OnChainAgentProfile): AgentProfile {
    const hasTEE = onChain.trustModels.some(tm => tm.type === 'tee-attestation');

    return {
      agentId: onChain.agentId,
      walletAddress: onChain.walletAddress,
      ownerAddress: onChain.owner,
      name: onChain.name,
      description: onChain.description,
      capabilities: onChain.capabilities,
      mcpEndpoint: onChain.mcpEndpoint,
      apiEndpoint: onChain.apiEndpoint,
      teeAttestation: hasTEE,
      dockerDigest: undefined,
      verificationLevel: hasTEE ? VerificationLevel.TRUSTED : VerificationLevel.BASIC,
      reputationScore: 3.0,
      totalJobs: 0,
      successfulJobs: 0,
      failedJobs: 0,
      totalEarnings: 0,
      avgResponseTime: 0,
      stakedAmount: 0,
      slashCount: 0,
      isActive: onChain.isActive,
      registeredAt: onChain.registeredAt,
      lastActiveAt: onChain.lastUpdated
    };
  }

  // Helper: Convert status level to VerificationLevel enum
  private statusToVerificationLevel(level: AgentVerificationStatus['verificationLevel']): VerificationLevel {
    switch (level) {
      case 'none': return VerificationLevel.UNVERIFIED;
      case 'basic': return VerificationLevel.BASIC;
      case 'standard': return VerificationLevel.STANDARD;
      case 'trusted': return VerificationLevel.TRUSTED;
      case 'verified': return VerificationLevel.VERIFIED;
      default: return VerificationLevel.BASIC;
    }
  }

  /**
   * Clear all agents (for testing)
   */
  clear(): void {
    this.agents.clear();
    this.agentsByWallet.clear();
    this.agentsByCapability.clear();
  }
}

// Singleton instance
let registryInstance: AgentIdentityRegistry | null = null;

export function getAgentIdentityRegistry(): AgentIdentityRegistry {
  if (!registryInstance) {
    registryInstance = new AgentIdentityRegistry();
  }
  return registryInstance;
}

export function resetAgentIdentityRegistry(): void {
  registryInstance = null;
}
