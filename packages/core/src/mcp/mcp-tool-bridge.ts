// ============================================================
// MCP TOOL INTENT BRIDGE
// Bridges MCP tools with the Intent bidding system
// Each MCP tool provider can bid on tool execution intents
// ============================================================

import { EventEmitter } from 'eventemitter3';
import { nanoid } from 'nanoid';
import {
  Intent,
  IntentStatus,
  IntentCategory,
  Bid,
  BidStatus,
} from '@synapse/types';

// -------------------- TYPES --------------------

export interface MCPToolRequest {
  /** Tool name to execute */
  toolName: string;
  /** Tool input parameters */
  toolInput: Record<string, unknown>;
  /** Required capabilities (for filtering providers) */
  capabilities?: string[];
  /** Maximum budget in USDC */
  maxBudget: number;
  /** Client wallet address */
  clientAddress: string;
  /** Bidding duration in ms (default: 10s for tools) */
  biddingDuration?: number;
  /** Prefer specific providers */
  preferredProviders?: string[];
}

export interface MCPToolBid extends Bid {
  /** Tool ID from this provider */
  toolId: string;
  /** MCP server endpoint */
  mcpEndpoint: string;
  /** Tool provider name */
  providerName: string;
  /** Execution price in USDC */
  price: number;
  /** Estimated latency in ms */
  estimatedLatency: number;
  /** Reliability score (0-1, based on success rate) */
  reliability: number;
  /** Tool capabilities */
  capabilities: string[];
  /** Tool version */
  version?: string;
}

export interface MCPToolIntent extends Intent {
  type: 'mcp.tool';
  category: IntentCategory;
  params: {
    toolName: string;
    toolInput: Record<string, unknown>;
    capabilities: string[];
  };
  toolBids: MCPToolBid[];
  selectedToolId?: string;
  executionResult?: MCPToolExecutionResult;
}

export interface MCPToolExecutionResult {
  /** Tool output */
  output: unknown;
  /** Actual execution time */
  executionTime: number;
  /** Provider that executed */
  providerId: string;
  /** Payment transaction hash */
  paymentTxHash?: string;
  /** Cost paid */
  cost: number;
}

export interface MCPToolProvider {
  id: string;
  name: string;
  endpoint: string;
  tools: string[];
  capabilities: string[];
  reputationScore: number;
  reliability: number;
  avgLatency: number;
  priceMultiplier: number; // Base price multiplier
}

// -------------------- EVENTS --------------------

interface MCPToolBridgeEvents {
  'intent:created': (intent: MCPToolIntent) => void;
  'bid:received': (bid: MCPToolBid, intent: MCPToolIntent) => void;
  'bidding:closed': (intent: MCPToolIntent) => void;
  'tool:selected': (intent: MCPToolIntent, toolId: string) => void;
  'tool:executed': (intent: MCPToolIntent, result: MCPToolExecutionResult) => void;
  'payment:completed': (intent: MCPToolIntent, txHash: string) => void;
}

// -------------------- MCP TOOL BRIDGE --------------------

export class MCPToolBridge extends EventEmitter<MCPToolBridgeEvents> {
  private intents: Map<string, MCPToolIntent> = new Map();
  private biddingTimers: Map<string, NodeJS.Timeout> = new Map();
  private providers: Map<string, MCPToolProvider> = new Map();

  // Base pricing for tools (can be overridden per-tool)
  private basePricing: Record<string, number> = {
    'weather.current': 0.005,
    'weather.forecast': 0.008,
    'crypto.price': 0.003,
    'crypto.history': 0.01,
    'news.latest': 0.005,
    'news.search': 0.008,
    'data.fetch': 0.01,
    'ai.summarize': 0.02,
    'ai.translate': 0.015,
    'compute.run': 0.05,
  };

  constructor() {
    super();
  }

  // -------------------- INTENT CREATION --------------------

  /**
   * Create a tool execution intent
   * This initiates the bidding process where MCP providers compete
   */
  async createToolIntent(request: MCPToolRequest): Promise<MCPToolIntent> {
    const now = Date.now();
    const biddingDuration = request.biddingDuration || 10000; // 10 seconds for tools

    const intent: MCPToolIntent = {
      id: `mcp_int_${nanoid(16)}`,
      clientAddress: request.clientAddress,
      type: 'mcp.tool',
      category: IntentCategory.DATA, // Most tools are data-related
      params: {
        toolName: request.toolName,
        toolInput: request.toolInput,
        capabilities: request.capabilities || [],
      },
      maxBudget: request.maxBudget,
      currency: 'USDC',
      requirements: {
        minReputation: 0,
        requireTEE: false,
      },
      createdAt: now,
      biddingDeadline: now + biddingDuration,
      executionDeadline: now + biddingDuration + 60000, // 1 min after bidding
      status: IntentStatus.OPEN,
      failoverQueue: [],
      toolBids: [],
    };

    this.intents.set(intent.id, intent);

    // Start bidding timer
    this.startBiddingTimer(intent);

    // Auto-collect bids from registered providers
    await this.collectBidsFromProviders(intent);

    this.emit('intent:created', intent);
    return intent;
  }

  // -------------------- BIDDING --------------------

  /**
   * Collect bids from all registered providers that support this tool
   */
  private async collectBidsFromProviders(intent: MCPToolIntent): Promise<void> {
    const { toolName, capabilities } = intent.params;

    for (const provider of this.providers.values()) {
      // Check if provider supports this tool
      if (!provider.tools.includes(toolName) &&
          !capabilities.some(cap => provider.capabilities.includes(cap))) {
        continue;
      }

      // Calculate bid price
      const basePrice = this.basePricing[toolName] || 0.01;
      const price = basePrice * provider.priceMultiplier;

      // Skip if over budget
      if (price > intent.maxBudget) continue;

      // Create bid
      const bid: MCPToolBid = {
        id: `mcp_bid_${nanoid(12)}`,
        intentId: intent.id,
        providerAddress: provider.id,
        providerId: provider.id,
        toolId: `${provider.id}:${toolName}`,
        mcpEndpoint: provider.endpoint,
        providerName: provider.name,
        price,
        estimatedLatency: provider.avgLatency,
        reliability: provider.reliability,
        capabilities: provider.capabilities,
        bidAmount: price,
        estimatedTime: provider.avgLatency,
        confidence: provider.reliability * 100,
        reputationScore: provider.reputationScore,
        teeAttested: false,
        calculatedScore: 0,
        rank: 0,
        submittedAt: Date.now(),
        expiresAt: intent.executionDeadline,
        status: BidStatus.PENDING,
      };

      // Calculate score and add bid
      bid.calculatedScore = this.calculateToolBidScore(bid, intent);
      intent.toolBids.push(bid);
      this.emit('bid:received', bid, intent);
    }

    // Rank all bids
    this.rankToolBids(intent);
  }

  /**
   * Submit a tool bid (called by MCP providers)
   */
  submitToolBid(
    intentId: string,
    providerId: string,
    providerName: string,
    mcpEndpoint: string,
    toolId: string,
    price: number,
    estimatedLatency: number,
    reliability: number,
    capabilities: string[] = []
  ): MCPToolBid | null {
    const intent = this.intents.get(intentId);
    if (!intent) {
      console.error(`[MCPToolBridge] Intent ${intentId} not found`);
      return null;
    }

    if (intent.status !== IntentStatus.OPEN) {
      console.error(`[MCPToolBridge] Intent ${intentId} is not accepting bids`);
      return null;
    }

    if (price > intent.maxBudget) {
      console.error(`[MCPToolBridge] Bid price ${price} exceeds budget ${intent.maxBudget}`);
      return null;
    }

    const bid: MCPToolBid = {
      id: `mcp_bid_${nanoid(12)}`,
      intentId,
      providerAddress: providerId,
      providerId,
      toolId,
      mcpEndpoint,
      providerName,
      price,
      estimatedLatency,
      reliability,
      capabilities,
      bidAmount: price,
      estimatedTime: estimatedLatency,
      confidence: reliability * 100,
      reputationScore: 4.0, // Default, can be looked up
      teeAttested: false,
      calculatedScore: 0,
      rank: 0,
      submittedAt: Date.now(),
      expiresAt: intent.executionDeadline,
      status: BidStatus.PENDING,
    };

    bid.calculatedScore = this.calculateToolBidScore(bid, intent);
    intent.toolBids.push(bid);
    this.rankToolBids(intent);

    this.emit('bid:received', bid, intent);
    return bid;
  }

  /**
   * Calculate score for a tool bid
   * Weights: reliability (35%), price (30%), speed (25%), reputation (10%)
   */
  private calculateToolBidScore(bid: MCPToolBid, intent: MCPToolIntent): number {
    const reliabilityScore = bid.reliability; // 0-1
    const costScore = Math.max(0, 1 - (bid.price / intent.maxBudget));
    const speedScore = Math.max(0, 1 - (bid.estimatedLatency / 10000)); // 10s max
    const reputationScore = bid.reputationScore / 5;

    // Weighted sum - tools value reliability highly
    const baseScore = (
      0.35 * reliabilityScore +
      0.30 * costScore +
      0.25 * speedScore +
      0.10 * reputationScore
    );

    return Math.round(baseScore * 100);
  }

  /**
   * Rank all tool bids by score
   */
  private rankToolBids(intent: MCPToolIntent): void {
    intent.toolBids.sort((a, b) => b.calculatedScore - a.calculatedScore);
    intent.toolBids.forEach((bid, index) => {
      bid.rank = index + 1;
    });
  }

  // -------------------- BIDDING TIMER --------------------

  private startBiddingTimer(intent: MCPToolIntent): void {
    const timeUntilDeadline = intent.biddingDeadline - Date.now();

    const timer = setTimeout(() => {
      this.closeBidding(intent.id);
    }, Math.max(0, timeUntilDeadline));

    this.biddingTimers.set(intent.id, timer);
  }

  private closeBidding(intentId: string): void {
    const intent = this.intents.get(intentId);
    if (!intent || intent.status !== IntentStatus.OPEN) return;

    const timer = this.biddingTimers.get(intentId);
    if (timer) {
      clearTimeout(timer);
      this.biddingTimers.delete(intentId);
    }

    if (intent.toolBids.length === 0) {
      intent.status = IntentStatus.FAILED;
      return;
    }

    intent.status = IntentStatus.BIDDING_CLOSED;
    this.emit('bidding:closed', intent);
  }

  /**
   * Force close bidding (for immediate selection)
   */
  forceCloseBidding(intentId: string): void {
    this.closeBidding(intentId);
  }

  // -------------------- TOOL SELECTION & EXECUTION --------------------

  /**
   * Select the winning tool (usually auto-selects highest score)
   */
  async selectTool(
    intentId: string,
    toolId?: string
  ): Promise<{ success: boolean; bid?: MCPToolBid; error?: string }> {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return { success: false, error: 'Intent not found' };
    }

    // Auto-select best bid if no toolId specified
    const selectedBid = toolId
      ? intent.toolBids.find(b => b.toolId === toolId)
      : intent.toolBids[0]; // Highest scored

    if (!selectedBid) {
      return { success: false, error: 'No matching bid found' };
    }

    // Update bid statuses
    selectedBid.status = BidStatus.ACCEPTED;
    intent.toolBids.forEach(bid => {
      if (bid.toolId !== selectedBid.toolId) {
        bid.status = BidStatus.REJECTED;
      }
    });

    intent.selectedToolId = selectedBid.toolId;
    intent.assignedProvider = selectedBid.providerAddress;
    intent.status = IntentStatus.ASSIGNED;

    this.emit('tool:selected', intent, selectedBid.toolId);
    return { success: true, bid: selectedBid };
  }

  /**
   * Record execution result
   */
  recordExecution(
    intentId: string,
    result: MCPToolExecutionResult
  ): void {
    const intent = this.intents.get(intentId);
    if (!intent) return;

    intent.executionResult = result;
    intent.status = IntentStatus.COMPLETED;

    intent.result = {
      data: result.output,
      providerId: result.providerId,
      executionTime: result.executionTime,
      settlementTx: result.paymentTxHash,
      settledAmount: result.cost,
      completedAt: Date.now(),
    };

    this.emit('tool:executed', intent, result);

    if (result.paymentTxHash) {
      this.emit('payment:completed', intent, result.paymentTxHash);
    }
  }

  // -------------------- PROVIDER MANAGEMENT --------------------

  /**
   * Register an MCP tool provider
   */
  registerProvider(provider: MCPToolProvider): void {
    this.providers.set(provider.id, provider);
    console.log(`[MCPToolBridge] Provider registered: ${provider.name} (${provider.tools.length} tools)`);
  }

  /**
   * Unregister a provider
   */
  unregisterProvider(providerId: string): boolean {
    return this.providers.delete(providerId);
  }

  /**
   * Get all registered providers
   */
  getProviders(): MCPToolProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get providers that support a specific tool
   */
  getProvidersForTool(toolName: string): MCPToolProvider[] {
    return Array.from(this.providers.values())
      .filter(p => p.tools.includes(toolName));
  }

  // -------------------- QUERIES --------------------

  getIntent(intentId: string): MCPToolIntent | undefined {
    return this.intents.get(intentId);
  }

  getOpenIntents(): MCPToolIntent[] {
    return Array.from(this.intents.values())
      .filter(i => i.status === IntentStatus.OPEN);
  }

  getIntentsByClient(clientAddress: string): MCPToolIntent[] {
    return Array.from(this.intents.values())
      .filter(i => i.clientAddress === clientAddress);
  }

  /**
   * Get best bid for an intent
   */
  getBestBid(intentId: string): MCPToolBid | null {
    const intent = this.intents.get(intentId);
    if (!intent || intent.toolBids.length === 0) return null;
    return intent.toolBids[0]; // Already sorted by score
  }

  /**
   * Set base pricing for a tool type
   */
  setBasePricing(toolName: string, price: number): void {
    this.basePricing[toolName] = price;
  }
}

// -------------------- SINGLETON --------------------

let bridgeInstance: MCPToolBridge | null = null;

export function getMCPToolBridge(): MCPToolBridge {
  if (!bridgeInstance) {
    bridgeInstance = new MCPToolBridge();
  }
  return bridgeInstance;
}

export function resetMCPToolBridge(): void {
  bridgeInstance = null;
}
