// ============================================================
// INTENT-BASED PAYMENTS - Revolutionary autonomous payment flow
// Agent expresses WHAT they want, protocol finds HOW to fulfill
// ============================================================

import { EventEmitter } from 'eventemitter3';
import { X402Network } from '../types.js';

/**
 * Intent requirements for fulfillment
 */
export interface IntentRequirements {
  /** Maximum freshness of data in seconds */
  freshness?: number;
  /** Minimum reputation score (0-5) */
  minReputation?: number;
  /** Maximum latency in ms */
  maxLatency?: number;
  /** Preferred provider addresses */
  preferredProviders?: string[];
  /** Required capabilities */
  requiredCapabilities?: string[];
  /** Quality tier: 'economy' | 'standard' | 'premium' */
  qualityTier?: 'economy' | 'standard' | 'premium';
}

/**
 * Intent for fulfillment
 */
export interface Intent {
  /** Natural language description of what is needed */
  description: string;
  /** Maximum budget for fulfillment (USDC) */
  maxBudget: string;
  /** Specific capability being requested */
  capability?: string;
  /** Additional requirements */
  requirements?: IntentRequirements;
  /** Deadline timestamp */
  deadline?: number;
  /** Input data for the intent */
  input?: Record<string, unknown>;
}

/**
 * Tool candidate for fulfilling intent
 */
export interface ToolCandidate {
  /** Tool ID */
  id: string;
  /** Tool name */
  name: string;
  /** Provider address */
  provider: string;
  /** Price in USDC */
  price: string;
  /** Reputation score (0-5) */
  reputation: number;
  /** Average latency in ms */
  avgLatency: number;
  /** Capabilities */
  capabilities: string[];
  /** Match score for this intent (0-1) */
  matchScore: number;
  /** MCP endpoint URL */
  endpoint: string;
}

/**
 * Fulfillment result
 */
export interface FulfillmentResult {
  /** Whether fulfillment was successful */
  success: boolean;
  /** Result data */
  data?: unknown;
  /** Error message if failed */
  error?: string;
  /** Tool that fulfilled the intent */
  tool?: ToolCandidate;
  /** Amount paid */
  amountPaid?: string;
  /** Execution time in ms */
  executionTime?: number;
  /** Transaction or payment ID */
  paymentId?: string;
}

/**
 * Intent events
 */
export interface IntentEvents {
  /** Intent submitted */
  'intent:submitted': (intent: Intent) => void;
  /** Candidates found */
  'candidates:found': (intent: Intent, candidates: ToolCandidate[]) => void;
  /** Tool selected */
  'tool:selected': (intent: Intent, tool: ToolCandidate) => void;
  /** Fulfillment started */
  'fulfillment:started': (intent: Intent, tool: ToolCandidate) => void;
  /** Fulfillment completed */
  'fulfillment:completed': (intent: Intent, result: FulfillmentResult) => void;
  /** Fulfillment failed */
  'fulfillment:failed': (intent: Intent, error: string) => void;
}

/**
 * Tool registry interface (to be implemented by registry module)
 */
export interface ToolRegistry {
  /** Find tools that match a capability */
  findByCapability(capability: string): Promise<ToolCandidate[]>;
  /** Find tools by natural language query */
  search(query: string): Promise<ToolCandidate[]>;
  /** Get tool by ID */
  getById(id: string): Promise<ToolCandidate | null>;
}

/**
 * Payment handler interface
 */
export interface PaymentHandler {
  /** Make a payment for tool usage */
  pay(recipient: string, amount: string, resource: string): Promise<{ paymentId: string }>;
  /** Check available budget */
  getAvailableBudget(): Promise<string>;
}

/**
 * Tool executor interface
 */
export interface ToolExecutor {
  /** Execute a tool with arguments */
  execute(tool: ToolCandidate, args: Record<string, unknown>): Promise<unknown>;
}

/**
 * IntentResolver - Resolves intents to tool executions
 *
 * This is the revolutionary part: Agents express WHAT they want,
 * the protocol figures out HOW to get it.
 *
 * Flow:
 * 1. Agent submits intent: "get weather for NYC"
 * 2. Resolver finds matching tools from registry
 * 3. Resolver ranks by price/reputation/capability match
 * 4. Resolver selects optimal tool
 * 5. Resolver handles payment
 * 6. Resolver executes and returns result
 */
export class IntentResolver extends EventEmitter<IntentEvents> {
  private registry: ToolRegistry;
  private paymentHandler: PaymentHandler;
  private executor: ToolExecutor;
  private network: X402Network;

  constructor(config: {
    registry: ToolRegistry;
    paymentHandler: PaymentHandler;
    executor: ToolExecutor;
    network: X402Network;
  }) {
    super();
    this.registry = config.registry;
    this.paymentHandler = config.paymentHandler;
    this.executor = config.executor;
    this.network = config.network;
  }

  /**
   * Fulfill an intent
   */
  async fulfill(intent: Intent): Promise<FulfillmentResult> {
    const startTime = Date.now();

    try {
      this.emit('intent:submitted', intent);

      // Step 1: Find candidate tools
      const candidates = await this.findCandidates(intent);
      if (candidates.length === 0) {
        const error = 'No tools found that can fulfill this intent';
        this.emit('fulfillment:failed', intent, error);
        return { success: false, error };
      }

      this.emit('candidates:found', intent, candidates);

      // Step 2: Rank and select best tool
      const rankedCandidates = this.rankCandidates(candidates, intent);
      const selectedTool = rankedCandidates[0];

      // Check budget
      if (parseFloat(selectedTool.price) > parseFloat(intent.maxBudget)) {
        const error = `Best tool costs ${selectedTool.price} USDC but budget is ${intent.maxBudget} USDC`;
        this.emit('fulfillment:failed', intent, error);
        return { success: false, error };
      }

      this.emit('tool:selected', intent, selectedTool);

      // Step 3: Make payment
      const availableBudget = await this.paymentHandler.getAvailableBudget();
      if (parseFloat(availableBudget) < parseFloat(selectedTool.price)) {
        const error = `Insufficient funds. Need ${selectedTool.price} USDC but only ${availableBudget} available`;
        this.emit('fulfillment:failed', intent, error);
        return { success: false, error };
      }

      this.emit('fulfillment:started', intent, selectedTool);

      const payment = await this.paymentHandler.pay(
        selectedTool.provider,
        selectedTool.price,
        `${selectedTool.name}: ${intent.description}`
      );

      // Step 4: Execute tool
      const result = await this.executor.execute(selectedTool, intent.input || {});

      const executionTime = Date.now() - startTime;
      const fulfillmentResult: FulfillmentResult = {
        success: true,
        data: result,
        tool: selectedTool,
        amountPaid: selectedTool.price,
        executionTime,
        paymentId: payment.paymentId,
      };

      this.emit('fulfillment:completed', intent, fulfillmentResult);
      return fulfillmentResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('fulfillment:failed', intent, errorMessage);
      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Find candidate tools for intent
   */
  private async findCandidates(intent: Intent): Promise<ToolCandidate[]> {
    let candidates: ToolCandidate[] = [];

    // Search by capability if specified
    if (intent.capability) {
      candidates = await this.registry.findByCapability(intent.capability);
    }

    // Search by description
    const searchCandidates = await this.registry.search(intent.description);
    candidates = this.mergeCandidates(candidates, searchCandidates);

    // Filter by budget
    candidates = candidates.filter(c => parseFloat(c.price) <= parseFloat(intent.maxBudget));

    // Filter by requirements
    if (intent.requirements) {
      candidates = this.filterByRequirements(candidates, intent.requirements);
    }

    return candidates;
  }

  /**
   * Merge candidate lists removing duplicates
   */
  private mergeCandidates(list1: ToolCandidate[], list2: ToolCandidate[]): ToolCandidate[] {
    const seen = new Set<string>();
    const merged: ToolCandidate[] = [];

    for (const candidate of [...list1, ...list2]) {
      if (!seen.has(candidate.id)) {
        seen.add(candidate.id);
        merged.push(candidate);
      }
    }

    return merged;
  }

  /**
   * Filter candidates by requirements
   */
  private filterByRequirements(candidates: ToolCandidate[], requirements: IntentRequirements): ToolCandidate[] {
    return candidates.filter(candidate => {
      // Min reputation
      if (requirements.minReputation && candidate.reputation < requirements.minReputation) {
        return false;
      }

      // Max latency
      if (requirements.maxLatency && candidate.avgLatency > requirements.maxLatency) {
        return false;
      }

      // Required capabilities
      if (requirements.requiredCapabilities) {
        const hasAll = requirements.requiredCapabilities.every(cap =>
          candidate.capabilities.includes(cap)
        );
        if (!hasAll) return false;
      }

      // Preferred providers boost (don't filter, just for ranking)

      return true;
    });
  }

  /**
   * Rank candidates by suitability
   */
  private rankCandidates(candidates: ToolCandidate[], intent: Intent): ToolCandidate[] {
    // Calculate match scores
    const scored = candidates.map(candidate => {
      let score = 0;

      // Lower price = higher score (normalize to 0-1)
      const maxPrice = Math.max(...candidates.map(c => parseFloat(c.price)));
      const priceScore = 1 - (parseFloat(candidate.price) / maxPrice);
      score += priceScore * 0.3;

      // Higher reputation = higher score
      const reputationScore = candidate.reputation / 5;
      score += reputationScore * 0.4;

      // Lower latency = higher score
      const maxLatency = Math.max(...candidates.map(c => c.avgLatency));
      const latencyScore = 1 - (candidate.avgLatency / maxLatency);
      score += latencyScore * 0.2;

      // Preferred provider bonus
      if (intent.requirements?.preferredProviders?.includes(candidate.provider)) {
        score += 0.1;
      }

      // Quality tier adjustment
      if (intent.requirements?.qualityTier) {
        switch (intent.requirements.qualityTier) {
          case 'economy':
            // Boost low-price options
            score += priceScore * 0.2;
            break;
          case 'premium':
            // Boost high-reputation options
            score += reputationScore * 0.2;
            break;
          // 'standard' uses default weights
        }
      }

      return { ...candidate, matchScore: Math.min(1, score) };
    });

    // Sort by score descending
    return scored.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Preview candidates without executing
   */
  async preview(intent: Intent): Promise<ToolCandidate[]> {
    const candidates = await this.findCandidates(intent);
    return this.rankCandidates(candidates, intent);
  }

  /**
   * Estimate cost for intent
   */
  async estimateCost(intent: Intent): Promise<{
    minCost: string;
    maxCost: string;
    recommendedBudget: string;
    candidateCount: number;
  }> {
    const candidates = await this.findCandidates(intent);

    if (candidates.length === 0) {
      return {
        minCost: '0',
        maxCost: '0',
        recommendedBudget: '0',
        candidateCount: 0,
      };
    }

    const prices = candidates.map(c => parseFloat(c.price));
    const minCost = Math.min(...prices);
    const maxCost = Math.max(...prices);
    const avgCost = prices.reduce((a, b) => a + b, 0) / prices.length;

    return {
      minCost: minCost.toFixed(6),
      maxCost: maxCost.toFixed(6),
      recommendedBudget: (avgCost * 1.2).toFixed(6), // 20% buffer
      candidateCount: candidates.length,
    };
  }
}

/**
 * Simple intent builder for ease of use
 */
export class IntentBuilder {
  private intent: Partial<Intent> = {};

  /**
   * Set the intent description
   */
  describe(description: string): this {
    this.intent.description = description;
    return this;
  }

  /**
   * Set the capability
   */
  capability(cap: string): this {
    this.intent.capability = cap;
    return this;
  }

  /**
   * Set the budget
   */
  budget(amount: string): this {
    this.intent.maxBudget = amount;
    return this;
  }

  /**
   * Set minimum reputation
   */
  minReputation(score: number): this {
    this.intent.requirements = this.intent.requirements || {};
    this.intent.requirements.minReputation = score;
    return this;
  }

  /**
   * Set max latency
   */
  maxLatency(ms: number): this {
    this.intent.requirements = this.intent.requirements || {};
    this.intent.requirements.maxLatency = ms;
    return this;
  }

  /**
   * Set quality tier
   */
  quality(tier: 'economy' | 'standard' | 'premium'): this {
    this.intent.requirements = this.intent.requirements || {};
    this.intent.requirements.qualityTier = tier;
    return this;
  }

  /**
   * Set input data
   */
  input(data: Record<string, unknown>): this {
    this.intent.input = data;
    return this;
  }

  /**
   * Set deadline
   */
  deadline(timestamp: number): this {
    this.intent.deadline = timestamp;
    return this;
  }

  /**
   * Build the intent
   */
  build(): Intent {
    if (!this.intent.description) {
      throw new Error('Intent description is required');
    }
    if (!this.intent.maxBudget) {
      throw new Error('Intent budget is required');
    }

    return this.intent as Intent;
  }
}

/**
 * Create intent builder
 */
export function intent(): IntentBuilder {
  return new IntentBuilder();
}
