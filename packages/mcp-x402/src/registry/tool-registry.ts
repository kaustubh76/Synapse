// ============================================================
// TOOL REGISTRY - Decentralized discovery for MCP tools
// Revolutionary: On-chain registry with staking and reputation
// ============================================================

import { EventEmitter } from 'eventemitter3';
import { X402Network, CHAIN_IDS } from '../types.js';
import type { ToolCandidate } from '../intents/intent-resolver.js';

/**
 * Tool registration data
 */
export interface ToolRegistration {
  /** Unique tool ID */
  id: string;
  /** Tool name */
  name: string;
  /** Provider wallet address */
  provider: string;
  /** MCP endpoint URL */
  endpoint: string;
  /** Tool description */
  description: string;
  /** Price in USDC */
  price: string;
  /** Capabilities/tags */
  capabilities: string[];
  /** Staked amount (USDC) */
  stake: string;
  /** Registration timestamp */
  registeredAt: number;
  /** Last activity timestamp */
  lastActiveAt: number;
  /** Whether the tool is active */
  isActive: boolean;
  /** Verification status */
  verified: boolean;
  /** Tool version */
  version: string;
  /** Schema for tool input */
  inputSchema?: Record<string, unknown>;
}

/**
 * Tool statistics
 */
export interface ToolStats {
  /** Total calls */
  totalCalls: number;
  /** Successful calls */
  successfulCalls: number;
  /** Failed calls */
  failedCalls: number;
  /** Average response time (ms) */
  avgResponseTime: number;
  /** Uptime percentage (0-100) */
  uptime: number;
  /** Total earnings (USDC) */
  totalEarnings: string;
  /** Unique callers */
  uniqueCallers: number;
  /** Last 24h calls */
  calls24h: number;
}

/**
 * Reputation data
 */
export interface ToolReputation {
  /** Overall score (0-5) */
  score: number;
  /** Number of ratings */
  ratingCount: number;
  /** Weighted score (stake-weighted) */
  weightedScore: number;
  /** Trust level */
  trustLevel: 'untrusted' | 'low' | 'medium' | 'high' | 'verified';
  /** Vouchers (addresses that vouch for this tool) */
  vouchers: string[];
  /** Disputes count */
  disputes: number;
  /** Resolved disputes */
  resolvedDisputes: number;
}

/**
 * Registry search options
 */
export interface SearchOptions {
  /** Text query */
  query?: string;
  /** Capability filter */
  capability?: string;
  /** Minimum reputation */
  minReputation?: number;
  /** Maximum price */
  maxPrice?: string;
  /** Minimum stake */
  minStake?: string;
  /** Only verified tools */
  verifiedOnly?: boolean;
  /** Sort by */
  sortBy?: 'reputation' | 'price' | 'calls' | 'stake';
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
  /** Limit */
  limit?: number;
  /** Offset */
  offset?: number;
}

/**
 * Registry events
 */
export interface RegistryEvents {
  /** Tool registered */
  'tool:registered': (tool: ToolRegistration) => void;
  /** Tool updated */
  'tool:updated': (tool: ToolRegistration) => void;
  /** Tool deactivated */
  'tool:deactivated': (toolId: string) => void;
  /** Stake added */
  'stake:added': (toolId: string, amount: string) => void;
  /** Stake slashed */
  'stake:slashed': (toolId: string, amount: string, reason: string) => void;
  /** Tool verified */
  'tool:verified': (toolId: string) => void;
  /** Dispute raised */
  'dispute:raised': (toolId: string, reason: string) => void;
}

/**
 * ToolRegistry - Decentralized registry for MCP tools
 *
 * Features:
 * - On-chain registration with staking
 * - Reputation tracking
 * - Capability-based discovery
 * - Stake slashing for bad actors
 * - Vouch system for trust propagation
 */
export class ToolRegistry extends EventEmitter<RegistryEvents> {
  private network: X402Network;
  private chainId: number;

  // In-memory storage (in production, this would be on-chain)
  private tools: Map<string, ToolRegistration> = new Map();
  private stats: Map<string, ToolStats> = new Map();
  private reputations: Map<string, ToolReputation> = new Map();
  private capabilityIndex: Map<string, Set<string>> = new Map();
  private providerIndex: Map<string, Set<string>> = new Map();

  // Configuration
  private readonly minStake: number = 10_000_000; // $10 USDC minimum stake
  private readonly slashPercent: number = 0.1; // 10% slash on dispute

  constructor(network: X402Network) {
    super();
    this.network = network;
    this.chainId = CHAIN_IDS[network];
  }

  /**
   * Register a new tool
   */
  async registerTool(params: {
    name: string;
    provider: string;
    endpoint: string;
    description: string;
    price: string;
    capabilities: string[];
    stake: string;
    version?: string;
    inputSchema?: Record<string, unknown>;
  }): Promise<ToolRegistration> {
    // Validate stake
    const stakeAmount = Math.floor(parseFloat(params.stake) * 1_000_000);
    if (stakeAmount < this.minStake) {
      throw new Error(`Minimum stake is $${this.minStake / 1_000_000} USDC`);
    }

    // Generate tool ID
    const id = this.generateToolId(params.provider, params.name);

    // Check for duplicate
    if (this.tools.has(id)) {
      throw new Error(`Tool ${params.name} already registered by this provider`);
    }

    // Create registration
    const tool: ToolRegistration = {
      id,
      name: params.name,
      provider: params.provider,
      endpoint: params.endpoint,
      description: params.description,
      price: params.price,
      capabilities: params.capabilities,
      stake: params.stake,
      registeredAt: Date.now(),
      lastActiveAt: Date.now(),
      isActive: true,
      verified: false,
      version: params.version || '1.0.0',
      inputSchema: params.inputSchema,
    };

    // Initialize stats
    const toolStats: ToolStats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      avgResponseTime: 0,
      uptime: 100,
      totalEarnings: '0',
      uniqueCallers: 0,
      calls24h: 0,
    };

    // Initialize reputation
    const reputation: ToolReputation = {
      score: 0,
      ratingCount: 0,
      weightedScore: 0,
      trustLevel: 'untrusted',
      vouchers: [],
      disputes: 0,
      resolvedDisputes: 0,
    };

    // Store
    this.tools.set(id, tool);
    this.stats.set(id, toolStats);
    this.reputations.set(id, reputation);

    // Update indexes
    for (const cap of params.capabilities) {
      if (!this.capabilityIndex.has(cap)) {
        this.capabilityIndex.set(cap, new Set());
      }
      this.capabilityIndex.get(cap)!.add(id);
    }

    if (!this.providerIndex.has(params.provider)) {
      this.providerIndex.set(params.provider, new Set());
    }
    this.providerIndex.get(params.provider)!.add(id);

    this.emit('tool:registered', tool);

    return tool;
  }

  /**
   * Update tool registration
   */
  async updateTool(toolId: string, updates: Partial<{
    endpoint: string;
    description: string;
    price: string;
    capabilities: string[];
    version: string;
    inputSchema: Record<string, unknown>;
  }>): Promise<ToolRegistration> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new Error(`Tool ${toolId} not found`);
    }

    // Update capability index if capabilities changed
    if (updates.capabilities) {
      // Remove from old capabilities
      for (const cap of tool.capabilities) {
        this.capabilityIndex.get(cap)?.delete(toolId);
      }
      // Add to new capabilities
      for (const cap of updates.capabilities) {
        if (!this.capabilityIndex.has(cap)) {
          this.capabilityIndex.set(cap, new Set());
        }
        this.capabilityIndex.get(cap)!.add(toolId);
      }
    }

    // Apply updates
    const updated = {
      ...tool,
      ...updates,
      lastActiveAt: Date.now(),
    };

    this.tools.set(toolId, updated);
    this.emit('tool:updated', updated);

    return updated;
  }

  /**
   * Deactivate tool
   */
  async deactivateTool(toolId: string): Promise<void> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new Error(`Tool ${toolId} not found`);
    }

    tool.isActive = false;
    this.tools.set(toolId, tool);
    this.emit('tool:deactivated', toolId);
  }

  /**
   * Add stake to tool
   */
  async addStake(toolId: string, amount: string): Promise<string> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new Error(`Tool ${toolId} not found`);
    }

    const currentStake = parseFloat(tool.stake);
    const additionalStake = parseFloat(amount);
    const newStake = (currentStake + additionalStake).toFixed(6);

    tool.stake = newStake;
    this.tools.set(toolId, tool);

    this.emit('stake:added', toolId, amount);

    return newStake;
  }

  /**
   * Slash stake (for disputes/bad behavior)
   */
  async slashStake(toolId: string, reason: string): Promise<string> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new Error(`Tool ${toolId} not found`);
    }

    const currentStake = parseFloat(tool.stake);
    const slashAmount = currentStake * this.slashPercent;
    const newStake = (currentStake - slashAmount).toFixed(6);

    tool.stake = newStake;
    this.tools.set(toolId, tool);

    // Update reputation
    const rep = this.reputations.get(toolId);
    if (rep) {
      rep.disputes++;
      this.updateTrustLevel(toolId);
    }

    this.emit('stake:slashed', toolId, slashAmount.toFixed(6), reason);

    return newStake;
  }

  /**
   * Get tool by ID
   */
  async getById(toolId: string): Promise<ToolRegistration | null> {
    return this.tools.get(toolId) || null;
  }

  /**
   * Find tools by capability
   */
  async findByCapability(capability: string): Promise<ToolCandidate[]> {
    const toolIds = this.capabilityIndex.get(capability) || new Set();
    const candidates: ToolCandidate[] = [];

    for (const id of toolIds) {
      const tool = this.tools.get(id);
      const stats = this.stats.get(id);
      const rep = this.reputations.get(id);

      if (tool?.isActive) {
        candidates.push(this.toCandidate(tool, stats, rep));
      }
    }

    return candidates;
  }

  /**
   * Search tools
   */
  async search(query: string, options: SearchOptions = {}): Promise<ToolCandidate[]> {
    const results: ToolCandidate[] = [];
    const queryLower = query.toLowerCase();

    for (const [id, tool] of this.tools) {
      if (!tool.isActive) continue;

      const stats = this.stats.get(id);
      const rep = this.reputations.get(id);

      // Apply filters
      if (options.capability && !tool.capabilities.includes(options.capability)) {
        continue;
      }

      if (options.minReputation && (!rep || rep.score < options.minReputation)) {
        continue;
      }

      if (options.maxPrice && parseFloat(tool.price) > parseFloat(options.maxPrice)) {
        continue;
      }

      if (options.minStake && parseFloat(tool.stake) < parseFloat(options.minStake)) {
        continue;
      }

      if (options.verifiedOnly && !tool.verified) {
        continue;
      }

      // Text matching
      const matchesQuery = !options.query || (
        tool.name.toLowerCase().includes(queryLower) ||
        tool.description.toLowerCase().includes(queryLower) ||
        tool.capabilities.some(c => c.toLowerCase().includes(queryLower))
      );

      if (matchesQuery) {
        results.push(this.toCandidate(tool, stats, rep));
      }
    }

    // Sort results
    this.sortResults(results, options);

    // Apply pagination
    const start = options.offset || 0;
    const end = options.limit ? start + options.limit : undefined;

    return results.slice(start, end);
  }

  /**
   * Record a tool call (for stats)
   */
  async recordCall(toolId: string, params: {
    success: boolean;
    responseTime: number;
    caller: string;
    amount: string;
  }): Promise<void> {
    const stats = this.stats.get(toolId);
    if (!stats) return;

    stats.totalCalls++;
    if (params.success) {
      stats.successfulCalls++;
    } else {
      stats.failedCalls++;
    }

    // Update average response time
    stats.avgResponseTime = (
      (stats.avgResponseTime * (stats.totalCalls - 1) + params.responseTime) /
      stats.totalCalls
    );

    // Update earnings
    const currentEarnings = parseFloat(stats.totalEarnings);
    stats.totalEarnings = (currentEarnings + parseFloat(params.amount)).toFixed(6);

    // Update 24h calls (simplified - in production would track timestamps)
    stats.calls24h++;

    this.stats.set(toolId, stats);

    // Update last active
    const tool = this.tools.get(toolId);
    if (tool) {
      tool.lastActiveAt = Date.now();
      this.tools.set(toolId, tool);
    }
  }

  /**
   * Rate a tool
   */
  async rateTool(toolId: string, params: {
    rater: string;
    score: number; // 1-5
    stake: string; // Rater's stake (for weighting)
  }): Promise<void> {
    if (params.score < 1 || params.score > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    const rep = this.reputations.get(toolId);
    if (!rep) {
      throw new Error(`Tool ${toolId} not found`);
    }

    // Update simple score
    const totalScore = rep.score * rep.ratingCount;
    rep.ratingCount++;
    rep.score = (totalScore + params.score) / rep.ratingCount;

    // Update weighted score
    const weight = parseFloat(params.stake);
    rep.weightedScore = (rep.weightedScore + params.score * weight) / (rep.ratingCount * weight);

    this.reputations.set(toolId, rep);
    this.updateTrustLevel(toolId);
  }

  /**
   * Vouch for a tool
   */
  async vouchForTool(toolId: string, voucher: string): Promise<void> {
    const rep = this.reputations.get(toolId);
    if (!rep) {
      throw new Error(`Tool ${toolId} not found`);
    }

    if (!rep.vouchers.includes(voucher)) {
      rep.vouchers.push(voucher);
      this.reputations.set(toolId, rep);
      this.updateTrustLevel(toolId);
    }
  }

  /**
   * Verify a tool (admin action)
   */
  async verifyTool(toolId: string): Promise<void> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new Error(`Tool ${toolId} not found`);
    }

    tool.verified = true;
    this.tools.set(toolId, tool);

    const rep = this.reputations.get(toolId);
    if (rep) {
      rep.trustLevel = 'verified';
      this.reputations.set(toolId, rep);
    }

    this.emit('tool:verified', toolId);
  }

  /**
   * Raise a dispute
   */
  async raiseDispute(toolId: string, reason: string): Promise<void> {
    const rep = this.reputations.get(toolId);
    if (!rep) {
      throw new Error(`Tool ${toolId} not found`);
    }

    rep.disputes++;
    this.reputations.set(toolId, rep);
    this.updateTrustLevel(toolId);

    this.emit('dispute:raised', toolId, reason);
  }

  /**
   * Get tool stats
   */
  getStats(toolId: string): ToolStats | null {
    return this.stats.get(toolId) || null;
  }

  /**
   * Get tool reputation
   */
  getReputation(toolId: string): ToolReputation | null {
    return this.reputations.get(toolId) || null;
  }

  /**
   * Get all tools by provider
   */
  getByProvider(provider: string): ToolRegistration[] {
    const toolIds = this.providerIndex.get(provider) || new Set();
    return Array.from(toolIds)
      .map(id => this.tools.get(id))
      .filter((t): t is ToolRegistration => t !== undefined);
  }

  /**
   * Get registry stats
   */
  getRegistryStats(): {
    totalTools: number;
    activeTools: number;
    verifiedTools: number;
    totalStake: string;
    totalCalls: number;
    totalEarnings: string;
  } {
    let activeTools = 0;
    let verifiedTools = 0;
    let totalStake = 0;
    let totalCalls = 0;
    let totalEarnings = 0;

    for (const tool of this.tools.values()) {
      if (tool.isActive) activeTools++;
      if (tool.verified) verifiedTools++;
      totalStake += parseFloat(tool.stake);
    }

    for (const stats of this.stats.values()) {
      totalCalls += stats.totalCalls;
      totalEarnings += parseFloat(stats.totalEarnings);
    }

    return {
      totalTools: this.tools.size,
      activeTools,
      verifiedTools,
      totalStake: totalStake.toFixed(6),
      totalCalls,
      totalEarnings: totalEarnings.toFixed(6),
    };
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  private generateToolId(provider: string, name: string): string {
    const combined = `${provider.toLowerCase()}_${name.toLowerCase().replace(/\s+/g, '_')}`;
    return `tool_${this.simpleHash(combined)}`;
  }

  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  private toCandidate(
    tool: ToolRegistration,
    stats?: ToolStats,
    rep?: ToolReputation
  ): ToolCandidate {
    return {
      id: tool.id,
      name: tool.name,
      provider: tool.provider,
      price: tool.price,
      reputation: rep?.score || 0,
      avgLatency: stats?.avgResponseTime || 0,
      capabilities: tool.capabilities,
      matchScore: 0, // Set by intent resolver
      endpoint: tool.endpoint,
    };
  }

  private sortResults(results: ToolCandidate[], options: SearchOptions): void {
    const sortBy = options.sortBy || 'reputation';
    const sortOrder = options.sortOrder || 'desc';
    const multiplier = sortOrder === 'desc' ? -1 : 1;

    results.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'reputation':
          comparison = a.reputation - b.reputation;
          break;
        case 'price':
          comparison = parseFloat(a.price) - parseFloat(b.price);
          break;
        case 'calls':
          const statsA = this.stats.get(a.id);
          const statsB = this.stats.get(b.id);
          comparison = (statsA?.totalCalls || 0) - (statsB?.totalCalls || 0);
          break;
        case 'stake':
          const toolA = this.tools.get(a.id);
          const toolB = this.tools.get(b.id);
          comparison = parseFloat(toolA?.stake || '0') - parseFloat(toolB?.stake || '0');
          break;
      }
      return comparison * multiplier;
    });
  }

  private updateTrustLevel(toolId: string): void {
    const rep = this.reputations.get(toolId);
    const tool = this.tools.get(toolId);
    if (!rep || !tool) return;

    // Calculate trust level based on multiple factors
    const stake = parseFloat(tool.stake);
    const score = rep.score;
    const ratings = rep.ratingCount;
    const vouchers = rep.vouchers.length;
    const disputes = rep.disputes - rep.resolvedDisputes;

    if (tool.verified) {
      rep.trustLevel = 'verified';
    } else if (disputes >= 3) {
      rep.trustLevel = 'untrusted';
    } else if (stake >= 100 && score >= 4 && ratings >= 50 && vouchers >= 5) {
      rep.trustLevel = 'high';
    } else if (stake >= 50 && score >= 3 && ratings >= 10) {
      rep.trustLevel = 'medium';
    } else if (stake >= 10 && ratings >= 3) {
      rep.trustLevel = 'low';
    } else {
      rep.trustLevel = 'untrusted';
    }

    this.reputations.set(toolId, rep);
  }
}
