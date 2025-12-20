// ============================================================
// ERC-8004 REGISTRY CLIENT
// On-chain Agent Identity Registration and Discovery
// Based on: https://eips.ethereum.org/EIPS/eip-8004
// Docs: https://docs.eigencloud.xyz/eigenai/howto/build-trustless-agents
// ============================================================

import { EventEmitter } from 'eventemitter3';

export interface RegistryConfig {
  rpcUrl: string;
  registryAddress: string;
  chainId: number;
  privateKey?: string;
  demoMode?: boolean;
}

export interface OnChainAgentProfile {
  // Core Identity (on-chain)
  agentId: string;                    // uint256 as hex string
  owner: string;                      // EOA that controls the agent
  walletAddress: string;              // Agent's operational wallet (Crossmint)

  // Agent Card (stored on-chain or IPFS)
  name: string;
  description: string;
  version: string;
  capabilities: string[];
  skills: AgentSkill[];

  // Endpoints
  agentJsonUrl: string;               // /agent.json endpoint URL
  mcpEndpoint?: string;
  apiEndpoint?: string;

  // Trust Models
  trustModels: TrustModel[];

  // On-chain state
  registeredAt: number;
  lastUpdated: number;
  isActive: boolean;
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export interface TrustModel {
  type: 'reputation' | 'cryptoeconomic' | 'tee-attestation' | 'zk-proof';
  validatorAddress?: string;
  config: Record<string, unknown>;
}

export interface ReputationData {
  agentId: string;
  score: number;                      // 0-500 (representing 0.0-5.0)
  totalFeedback: number;
  positiveFeedback: number;
  lastFeedbackAt: number;
}

export interface ValidationResponse {
  agentId: string;
  taskId: string;
  validatorAddress: string;
  isValid: boolean;
  trustModel: string;
  proof?: string;
  timestamp: number;
}

export interface AgentRegistration {
  name: string;
  description: string;
  version: string;
  capabilities: string[];
  skills: AgentSkill[];
  walletAddress: string;
  agentJsonUrl: string;
  mcpEndpoint?: string;
  apiEndpoint?: string;
  trustModels?: TrustModel[];
  initialStake?: number;
}

interface ERC8004Events {
  'agent:registered': (profile: OnChainAgentProfile) => void;
  'agent:updated': (profile: OnChainAgentProfile) => void;
  'agent:deregistered': (agentId: string) => void;
  'reputation:updated': (agentId: string, oldScore: number, newScore: number) => void;
  'validation:submitted': (response: ValidationResponse) => void;
}

/**
 * ERC-8004 Registry Client
 *
 * Interacts with the on-chain ERC-8004 agent registry for:
 * - Agent registration and identity management
 * - Capability discovery
 * - Reputation queries
 * - Validation responses
 *
 * ERC-8004 defines three lightweight on-chain registries:
 * - Identity Registry: Agent profiles and capabilities
 * - Reputation Registry: Feedback and scores
 * - Validation Registry: Trust model responses
 *
 * @see https://eips.ethereum.org/EIPS/eip-8004
 * @see https://8004.org/
 */
export class ERC8004RegistryClient extends EventEmitter<ERC8004Events> {
  private config: RegistryConfig;
  private agents: Map<string, OnChainAgentProfile> = new Map();
  private agentsByWallet: Map<string, string> = new Map();
  private agentsByCapability: Map<string, Set<string>> = new Map();
  private reputations: Map<string, ReputationData> = new Map();
  private validations: Map<string, ValidationResponse[]> = new Map();

  constructor(config: RegistryConfig) {
    super();
    this.config = {
      demoMode: true,
      ...config
    };
  }

  // ============================================================
  // IDENTITY REGISTRY FUNCTIONS
  // ============================================================

  /**
   * Register a new agent on-chain
   * In production, this creates an on-chain transaction to the Identity Registry
   */
  async registerAgent(registration: AgentRegistration): Promise<OnChainAgentProfile> {
    if (this.config.demoMode) {
      return this.mockRegisterAgent(registration);
    }

    // Production: Submit transaction to ERC-8004 Identity Registry
    const response = await fetch(`${this.config.rpcUrl}/erc8004/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...registration,
        registryAddress: this.config.registryAddress,
        chainId: this.config.chainId
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to register agent: ${await response.text()}`);
    }

    const profile: OnChainAgentProfile = await response.json();
    this.cacheAgent(profile);
    this.emit('agent:registered', profile);
    return profile;
  }

  /**
   * Get agent by on-chain ID
   */
  async getAgent(agentId: string): Promise<OnChainAgentProfile | null> {
    // Check cache first
    const cached = this.agents.get(agentId);
    if (cached) return cached;

    if (this.config.demoMode) {
      return null;
    }

    // Fetch from chain
    const response = await fetch(`${this.config.rpcUrl}/erc8004/agents/${agentId}`);
    if (!response.ok) return null;

    const profile: OnChainAgentProfile = await response.json();
    this.cacheAgent(profile);
    return profile;
  }

  /**
   * Get agent by wallet address
   */
  async getAgentByWallet(walletAddress: string): Promise<OnChainAgentProfile | null> {
    const agentId = this.agentsByWallet.get(walletAddress.toLowerCase());
    if (agentId) {
      return this.agents.get(agentId) || null;
    }

    if (this.config.demoMode) {
      return null;
    }

    // Query chain by wallet
    const response = await fetch(`${this.config.rpcUrl}/erc8004/agents/by-wallet/${walletAddress}`);
    if (!response.ok) return null;

    const profile: OnChainAgentProfile = await response.json();
    this.cacheAgent(profile);
    return profile;
  }

  /**
   * Search agents by capability
   */
  async searchAgents(options: {
    capability?: string;
    trustModels?: string[];
    minReputation?: number;
    activeOnly?: boolean;
    x402Support?: boolean;
    limit?: number;
  }): Promise<OnChainAgentProfile[]> {
    if (this.config.demoMode) {
      return this.mockSearchAgents(options);
    }

    const params = new URLSearchParams();
    if (options.capability) params.set('capability', options.capability);
    if (options.trustModels) params.set('trustModels', options.trustModels.join(','));
    if (options.minReputation) params.set('minReputation', options.minReputation.toString());
    if (options.activeOnly !== undefined) params.set('activeOnly', options.activeOnly.toString());
    if (options.x402Support) params.set('x402Support', 'true');
    if (options.limit) params.set('limit', options.limit.toString());

    const response = await fetch(`${this.config.rpcUrl}/erc8004/agents/search?${params}`);
    if (!response.ok) return [];

    const agents: OnChainAgentProfile[] = await response.json();
    agents.forEach(a => this.cacheAgent(a));
    return agents;
  }

  /**
   * Update agent profile
   */
  async updateAgent(agentId: string, updates: Partial<AgentRegistration>): Promise<OnChainAgentProfile> {
    const existing = this.agents.get(agentId);
    if (!existing) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (this.config.demoMode) {
      return this.mockUpdateAgent(agentId, updates);
    }

    const response = await fetch(`${this.config.rpcUrl}/erc8004/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      throw new Error(`Failed to update agent: ${await response.text()}`);
    }

    const profile: OnChainAgentProfile = await response.json();
    this.cacheAgent(profile);
    this.emit('agent:updated', profile);
    return profile;
  }

  /**
   * Deregister agent
   */
  async deregisterAgent(agentId: string): Promise<void> {
    if (this.config.demoMode) {
      this.agents.delete(agentId);
      this.emit('agent:deregistered', agentId);
      return;
    }

    const response = await fetch(`${this.config.rpcUrl}/erc8004/agents/${agentId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error(`Failed to deregister agent: ${await response.text()}`);
    }

    this.agents.delete(agentId);
    this.emit('agent:deregistered', agentId);
  }

  // ============================================================
  // REPUTATION REGISTRY FUNCTIONS
  // ============================================================

  /**
   * Get reputation for an agent
   */
  async getReputation(agentId: string): Promise<ReputationData | null> {
    const cached = this.reputations.get(agentId);
    if (cached) return cached;

    if (this.config.demoMode) {
      return this.mockGetReputation(agentId);
    }

    const response = await fetch(`${this.config.rpcUrl}/erc8004/reputation/${agentId}`);
    if (!response.ok) return null;

    const reputation: ReputationData = await response.json();
    this.reputations.set(agentId, reputation);
    return reputation;
  }

  /**
   * Submit feedback for an agent
   */
  async submitFeedback(feedback: {
    agentId: string;
    taskId: string;
    rating: number;        // 1-5
    success: boolean;
    comment?: string;
  }): Promise<void> {
    if (this.config.demoMode) {
      this.mockSubmitFeedback(feedback);
      return;
    }

    const response = await fetch(`${this.config.rpcUrl}/erc8004/reputation/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedback)
    });

    if (!response.ok) {
      throw new Error(`Failed to submit feedback: ${await response.text()}`);
    }
  }

  // ============================================================
  // VALIDATION REGISTRY FUNCTIONS
  // ============================================================

  /**
   * Submit a validation response for a task
   */
  async submitValidation(validation: {
    agentId: string;
    taskId: string;
    isValid: boolean;
    trustModel: string;
    proof?: string;
  }): Promise<ValidationResponse> {
    const response: ValidationResponse = {
      ...validation,
      validatorAddress: this.config.registryAddress, // In production, this is the validator's address
      timestamp: Date.now()
    };

    if (this.config.demoMode) {
      const existing = this.validations.get(validation.agentId) || [];
      existing.push(response);
      this.validations.set(validation.agentId, existing);
      this.emit('validation:submitted', response);
      return response;
    }

    const apiResponse = await fetch(`${this.config.rpcUrl}/erc8004/validation/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validation)
    });

    if (!apiResponse.ok) {
      throw new Error(`Failed to submit validation: ${await apiResponse.text()}`);
    }

    const result = await apiResponse.json();
    this.emit('validation:submitted', result);
    return result;
  }

  /**
   * Get validations for an agent
   */
  async getValidations(agentId: string): Promise<ValidationResponse[]> {
    if (this.config.demoMode) {
      return this.validations.get(agentId) || [];
    }

    const response = await fetch(`${this.config.rpcUrl}/erc8004/validation/${agentId}`);
    if (!response.ok) return [];

    return response.json();
  }

  /**
   * Check if agent has valid TEE attestation
   */
  async hasTEEAttestation(agentId: string): Promise<boolean> {
    const agent = await this.getAgent(agentId);
    if (!agent) return false;

    return agent.trustModels.some(tm => tm.type === 'tee-attestation');
  }

  // ============================================================
  // FETCH AGENT.JSON (ERC-8004 Standard Endpoint)
  // ============================================================

  /**
   * Fetch the /agent.json endpoint for an agent
   * This is the standard ERC-8004 agent card format
   */
  async fetchAgentJson(agentJsonUrl: string): Promise<{
    name: string;
    description: string;
    version: string;
    capabilities: string[];
    url: string;
    documentationUrl?: string;
    skills: AgentSkill[];
    defaultInputModes?: string[];
    defaultOutputModes?: string[];
    trustModels?: TrustModel[];
  }> {
    const response = await fetch(agentJsonUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch agent.json: ${response.statusText}`);
    }
    return response.json();
  }

  // ============================================================
  // CACHE HELPERS
  // ============================================================

  private cacheAgent(profile: OnChainAgentProfile): void {
    this.agents.set(profile.agentId, profile);
    this.agentsByWallet.set(profile.walletAddress.toLowerCase(), profile.agentId);

    for (const cap of profile.capabilities) {
      if (!this.agentsByCapability.has(cap)) {
        this.agentsByCapability.set(cap, new Set());
      }
      this.agentsByCapability.get(cap)!.add(profile.agentId);
    }
  }

  getAllCachedAgents(): OnChainAgentProfile[] {
    return Array.from(this.agents.values());
  }

  // ============================================================
  // MOCK IMPLEMENTATIONS (for demo mode)
  // ============================================================

  private mockRegisterAgent(registration: AgentRegistration): OnChainAgentProfile {
    const agentId = `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
    const now = Date.now();

    const profile: OnChainAgentProfile = {
      agentId,
      owner: registration.walletAddress, // In demo, owner = wallet
      walletAddress: registration.walletAddress,
      name: registration.name,
      description: registration.description,
      version: registration.version,
      capabilities: registration.capabilities,
      skills: registration.skills,
      agentJsonUrl: registration.agentJsonUrl,
      mcpEndpoint: registration.mcpEndpoint,
      apiEndpoint: registration.apiEndpoint,
      trustModels: registration.trustModels || [
        { type: 'reputation', config: {} }
      ],
      registeredAt: now,
      lastUpdated: now,
      isActive: true
    };

    this.cacheAgent(profile);

    // Initialize reputation
    this.reputations.set(agentId, {
      agentId,
      score: 300, // 3.0 starting score
      totalFeedback: 0,
      positiveFeedback: 0,
      lastFeedbackAt: now
    });

    this.emit('agent:registered', profile);
    return profile;
  }

  private mockSearchAgents(options: {
    capability?: string;
    trustModels?: string[];
    minReputation?: number;
    activeOnly?: boolean;
    limit?: number;
  }): OnChainAgentProfile[] {
    let results = Array.from(this.agents.values());

    if (options.activeOnly !== false) {
      results = results.filter(a => a.isActive);
    }

    if (options.capability) {
      results = results.filter(a =>
        a.capabilities.some(cap =>
          cap === options.capability ||
          cap.startsWith(options.capability!.split('.')[0])
        )
      );
    }

    if (options.trustModels?.length) {
      results = results.filter(a =>
        a.trustModels.some(tm => options.trustModels!.includes(tm.type))
      );
    }

    if (options.minReputation) {
      results = results.filter(a => {
        const rep = this.reputations.get(a.agentId);
        return rep && rep.score >= options.minReputation! * 100;
      });
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  private mockUpdateAgent(agentId: string, updates: Partial<AgentRegistration>): OnChainAgentProfile {
    const existing = this.agents.get(agentId)!;

    const updated: OnChainAgentProfile = {
      ...existing,
      ...updates,
      agentId,
      owner: existing.owner,
      walletAddress: existing.walletAddress,
      registeredAt: existing.registeredAt,
      lastUpdated: Date.now()
    };

    this.cacheAgent(updated);
    this.emit('agent:updated', updated);
    return updated;
  }

  private mockGetReputation(agentId: string): ReputationData | null {
    const agent = this.agents.get(agentId);
    if (!agent) return null;

    return this.reputations.get(agentId) || {
      agentId,
      score: 300,
      totalFeedback: 0,
      positiveFeedback: 0,
      lastFeedbackAt: Date.now()
    };
  }

  private mockSubmitFeedback(feedback: {
    agentId: string;
    rating: number;
    success: boolean;
  }): void {
    const rep = this.reputations.get(feedback.agentId);
    if (!rep) return;

    const oldScore = rep.score;
    rep.totalFeedback++;
    if (feedback.success && feedback.rating >= 4) {
      rep.positiveFeedback++;
    }

    // Update score (weighted average)
    const successRate = rep.positiveFeedback / rep.totalFeedback;
    const ratingContribution = (feedback.rating / 5) * 100;
    rep.score = Math.round(rep.score * 0.9 + (successRate * 300 + ratingContribution * 2) * 0.1);
    rep.score = Math.max(0, Math.min(500, rep.score));
    rep.lastFeedbackAt = Date.now();

    this.reputations.set(feedback.agentId, rep);

    if (Math.abs(rep.score - oldScore) > 1) {
      this.emit('reputation:updated', feedback.agentId, oldScore, rep.score);
    }
  }

  /**
   * Clear all cached data (for testing)
   */
  clear(): void {
    this.agents.clear();
    this.agentsByWallet.clear();
    this.agentsByCapability.clear();
    this.reputations.clear();
    this.validations.clear();
  }
}

// Singleton instance
let registryClientInstance: ERC8004RegistryClient | null = null;

export function getERC8004RegistryClient(config?: RegistryConfig): ERC8004RegistryClient {
  if (!registryClientInstance) {
    if (!config) {
      config = {
        rpcUrl: process.env.ERC8004_RPC_URL || process.env.BASE_RPC_URL || 'https://sepolia.base.org',
        registryAddress: process.env.ERC8004_REGISTRY_ADDRESS || '0x0000000000000000000000000000000000008004',
        chainId: parseInt(process.env.ERC8004_CHAIN_ID || '84532'),
        demoMode: process.env.ERC8004_DEMO_MODE !== 'false'
      };
    }
    registryClientInstance = new ERC8004RegistryClient(config);
  }
  return registryClientInstance;
}

export function resetERC8004RegistryClient(): void {
  registryClientInstance = null;
}
