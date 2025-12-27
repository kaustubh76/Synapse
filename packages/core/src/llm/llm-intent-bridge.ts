// ============================================================
// SYNAPSE LLM-INTENT BRIDGE
// Bridges LLM providers with the Intent bidding system
// Each LLM model acts as a provider that bids on user prompts
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
import { AgentCreditProfile } from './types.js';

// -------------------- TYPES --------------------

export interface LLMIntentRequest {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  modelTier?: 'premium' | 'standard' | 'budget' | 'all';
  maxBudget: number; // USDC budget for entire comparison
  clientAddress: string;
  biddingDuration?: number;
}

export interface LLMBid extends Bid {
  // LLM-specific fields
  modelId: string;
  response: string;
  tokenCount: {
    input: number;
    output: number;
    total: number;
  };
  cost: number;
  latency: number;
  qualityScore: number;
  provider: string;
  // Credit-aware pricing
  originalCost?: number;       // Cost before discount
  discountedCost?: number;     // Cost after tier discount
  discountApplied?: number;    // Discount percentage (0-0.20)
}

export interface LLMIntent extends Intent {
  type: 'llm.comparison';
  category: IntentCategory.AI;
  params: {
    prompt: string;
    systemPrompt?: string;
    maxTokens: number;
    temperature: number;
    modelTier: string;
  };
  llmBids: LLMBid[];
  selectedModelId?: string;
  paymentTxHash?: string;
  // Credit info
  creditInfo?: {
    agentId: string;
    creditScore: number;
    tier: string;
    discount: number;
    availableCredit: number;
    savingsApplied: number;
  };
}

export interface LLMIntentResult {
  intentId: string;
  status: IntentStatus;
  prompt: string;
  llmBids: LLMBid[];
  comparison: {
    cheapest: string;
    fastest: string;
    highestQuality: string;
    bestValue: string;
    recommended: string;
  };
  totalCost: number;
  avgLatency: number;
  biddingDeadline: number;
  userCanSelect: boolean;
}

// LLM Provider interface (maps to our existing providers)
export interface LLMProvider {
  id: string;
  name: string;
  models: string[];
  reputationScore: number;
  teeAttested: boolean;
  avgResponseTime: number;
  pricePerToken: number;
}

// -------------------- LLM INTENT BRIDGE --------------------

interface LLMIntentBridgeEvents {
  'intent:created': (intent: LLMIntent) => void;
  'bid:received': (bid: LLMBid, intent: LLMIntent) => void;
  'bidding:closed': (intent: LLMIntent) => void;
  'model:selected': (intent: LLMIntent, modelId: string) => void;
  'payment:completed': (intent: LLMIntent, txHash: string) => void;
}

export class LLMIntentBridge extends EventEmitter<LLMIntentBridgeEvents> {
  private intents: Map<string, LLMIntent> = new Map();
  private biddingTimers: Map<string, NodeJS.Timeout> = new Map();

  // Default LLM providers that act as bidders
  private llmProviders: Map<string, LLMProvider> = new Map([
    ['groq', {
      id: 'groq',
      name: 'Groq',
      models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
      reputationScore: 4.5,
      teeAttested: true,
      avgResponseTime: 500,
      pricePerToken: 0.00001
    }],
    ['google', {
      id: 'google',
      name: 'Google',
      models: ['gemini-2.0-flash-exp'],
      reputationScore: 4.8,
      teeAttested: true,
      avgResponseTime: 800,
      pricePerToken: 0.00002
    }],
    ['anthropic', {
      id: 'anthropic',
      name: 'Anthropic',
      models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
      reputationScore: 4.9,
      teeAttested: true,
      avgResponseTime: 1200,
      pricePerToken: 0.00003
    }],
    ['openai', {
      id: 'openai',
      name: 'OpenAI',
      models: ['gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
      reputationScore: 4.7,
      teeAttested: false,
      avgResponseTime: 1000,
      pricePerToken: 0.000025
    }]
  ]);

  constructor() {
    super();
  }

  // -------------------- INTENT CREATION --------------------

  /**
   * Create an LLM comparison intent
   * This initiates the bidding process where each LLM model competes
   */
  async createLLMIntent(request: LLMIntentRequest): Promise<LLMIntent> {
    const now = Date.now();
    const biddingDuration = request.biddingDuration || 30000; // 30 seconds for LLM bidding

    const intent: LLMIntent = {
      id: `llm_int_${nanoid(16)}`,
      clientAddress: request.clientAddress,
      type: 'llm.comparison',
      category: IntentCategory.AI,
      params: {
        prompt: request.prompt,
        systemPrompt: request.systemPrompt,
        maxTokens: request.maxTokens || 500,
        temperature: request.temperature || 0.7,
        modelTier: request.modelTier || 'all',
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
      llmBids: [],
    };

    this.intents.set(intent.id, intent);

    // Start bidding timer
    this.startBiddingTimer(intent);

    this.emit('intent:created', intent);
    return intent;
  }

  // -------------------- BIDDING --------------------

  /**
   * Submit an LLM bid (called by each LLM provider after generating response)
   */
  submitLLMBid(
    intentId: string,
    modelId: string,
    provider: string,
    response: string,
    tokenCount: { input: number; output: number; total: number },
    latency: number,
    cost: number,
    qualityScore: number,
    creditProfile?: AgentCreditProfile
  ): LLMBid | null {
    const intent = this.intents.get(intentId);
    if (!intent) {
      console.error(`[LLMBridge] Intent ${intentId} not found`);
      return null;
    }

    if (intent.status !== IntentStatus.OPEN) {
      console.error(`[LLMBridge] Intent ${intentId} is not accepting bids`);
      return null;
    }

    // Get provider info
    const llmProvider = this.llmProviders.get(provider);

    const bid: LLMBid = {
      id: `llm_bid_${nanoid(12)}`,
      intentId,
      providerAddress: `${provider}:${modelId}`,
      providerId: provider,
      modelId,
      provider,
      response,
      tokenCount,
      cost,
      latency,
      qualityScore,
      bidAmount: cost,
      estimatedTime: latency,
      confidence: Math.min(100, qualityScore * 10),
      reputationScore: llmProvider?.reputationScore || 4.0,
      teeAttested: llmProvider?.teeAttested || false,
      capabilities: ['ai.chat', 'ai.summarize'],
      calculatedScore: 0,
      rank: 0,
      submittedAt: Date.now(),
      expiresAt: intent.executionDeadline,
      status: BidStatus.PENDING,
    };

    // Calculate score based on multiple factors (including credit discount)
    bid.calculatedScore = this.calculateLLMBidScore(bid, intent, creditProfile);

    // Add bid and re-rank
    intent.llmBids.push(bid);
    this.rankLLMBids(intent);

    this.emit('bid:received', bid, intent);
    return bid;
  }

  /**
   * Apply credit profile to an existing intent's bids
   * Used when credit profile is loaded after bids are already submitted
   */
  applyCreditProfile(intentId: string, creditProfile: AgentCreditProfile): void {
    const intent = this.intents.get(intentId);
    if (!intent) {
      console.error(`[LLMBridge] Intent ${intentId} not found`);
      return;
    }

    // Recalculate all bid scores with credit profile
    let totalSavings = 0;
    for (const bid of intent.llmBids) {
      bid.calculatedScore = this.calculateLLMBidScore(bid, intent, creditProfile);
      totalSavings += (bid.originalCost || bid.cost) - (bid.discountedCost || bid.cost);
    }

    // Re-rank bids
    this.rankLLMBids(intent);

    // Store credit info on intent
    intent.creditInfo = {
      agentId: creditProfile.agentId,
      creditScore: creditProfile.creditScore,
      tier: creditProfile.creditTier,
      discount: creditProfile.tierDiscount,
      availableCredit: creditProfile.availableCredit,
      savingsApplied: totalSavings,
    };

    console.log(`[LLMBridge] Applied credit profile to intent ${intentId}: tier=${creditProfile.creditTier}, discount=${creditProfile.tierDiscount * 100}%`);
  }

  /**
   * Calculate score for an LLM bid
   * Weighs: cost (30%), quality (35%), speed (20%), reputation (15%)
   * Credit tier discount is applied to cost calculation
   */
  private calculateLLMBidScore(
    bid: LLMBid,
    intent: LLMIntent,
    creditProfile?: AgentCreditProfile
  ): number {
    // Apply credit tier discount to cost
    const tierDiscount = creditProfile?.tierDiscount || 0;
    const originalCost = bid.cost;
    const discountedCost = originalCost * (1 - tierDiscount);

    // Store discount info on bid
    bid.originalCost = originalCost;
    bid.discountedCost = discountedCost;
    bid.discountApplied = tierDiscount;

    // Use discounted cost for scoring (better score for credit holders)
    const costScore = Math.max(0, 1 - (discountedCost / intent.maxBudget));
    const qualityScore = bid.qualityScore / 10;
    const speedScore = Math.max(0, 1 - (bid.latency / 10000)); // 10s max
    const reputationScore = bid.reputationScore / 5;
    const teeBonus = bid.teeAttested ? 1.1 : 1.0;

    // Weighted sum
    const baseScore = (
      0.30 * costScore +
      0.35 * qualityScore +
      0.20 * speedScore +
      0.15 * reputationScore
    );

    return Math.round(baseScore * teeBonus * 100);
  }

  /**
   * Rank all LLM bids by score
   */
  private rankLLMBids(intent: LLMIntent): void {
    intent.llmBids.sort((a, b) => b.calculatedScore - a.calculatedScore);
    intent.llmBids.forEach((bid, index) => {
      bid.rank = index + 1;
    });
  }

  // -------------------- BIDDING TIMER --------------------

  private startBiddingTimer(intent: LLMIntent): void {
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

    if (intent.llmBids.length === 0) {
      intent.status = IntentStatus.FAILED;
      return;
    }

    intent.status = IntentStatus.BIDDING_CLOSED;
    this.emit('bidding:closed', intent);
  }

  /**
   * Force close bidding (for immediate user selection)
   */
  forceCloseBidding(intentId: string): void {
    this.closeBidding(intentId);
  }

  // -------------------- USER SELECTION --------------------

  /**
   * User selects their preferred model from the competing bids
   * This is where x402 payment is triggered
   */
  async selectModel(
    intentId: string,
    modelId: string,
    paymentTxHash?: string
  ): Promise<{ success: boolean; bid?: LLMBid; error?: string }> {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return { success: false, error: 'Intent not found' };
    }

    // Find the selected bid
    const selectedBid = intent.llmBids.find(b => b.modelId === modelId);
    if (!selectedBid) {
      return { success: false, error: 'Model not found in bids' };
    }

    // Update bid status
    selectedBid.status = BidStatus.ACCEPTED;

    // Mark other bids as rejected
    intent.llmBids.forEach(bid => {
      if (bid.modelId !== modelId) {
        bid.status = BidStatus.REJECTED;
      }
    });

    // Update intent
    intent.selectedModelId = modelId;
    intent.assignedProvider = selectedBid.providerAddress;
    intent.status = IntentStatus.COMPLETED;
    intent.paymentTxHash = paymentTxHash;

    intent.result = {
      data: {
        selectedModel: modelId,
        response: selectedBid.response,
        tokenCount: selectedBid.tokenCount,
      },
      providerId: selectedBid.providerAddress,
      executionTime: selectedBid.latency,
      settlementTx: paymentTxHash,
      settledAmount: selectedBid.cost,
      completedAt: Date.now(),
    };

    this.emit('model:selected', intent, modelId);
    return { success: true, bid: selectedBid };
  }

  /**
   * Record payment for a completed selection
   */
  recordPayment(intentId: string, txHash: string, amount: number): boolean {
    const intent = this.intents.get(intentId);
    if (!intent) return false;

    intent.paymentTxHash = txHash;
    if (intent.result) {
      intent.result.settlementTx = txHash;
      intent.result.settledAmount = amount;
    }

    this.emit('payment:completed', intent, txHash);
    return true;
  }

  // -------------------- QUERIES --------------------

  getIntent(intentId: string): LLMIntent | undefined {
    return this.intents.get(intentId);
  }

  getIntentResult(intentId: string): LLMIntentResult | null {
    const intent = this.intents.get(intentId);
    if (!intent) return null;

    const bids = intent.llmBids;
    const cheapest = bids.reduce((min, b) => b.cost < min.cost ? b : min, bids[0]);
    const fastest = bids.reduce((min, b) => b.latency < min.latency ? b : min, bids[0]);
    const highestQuality = bids.reduce((max, b) => b.qualityScore > max.qualityScore ? b : max, bids[0]);
    const bestValue = bids.reduce((best, b) => {
      const valueScore = (b.qualityScore / 10) / (b.cost || 0.0001);
      const bestScore = (best.qualityScore / 10) / (best.cost || 0.0001);
      return valueScore > bestScore ? b : best;
    }, bids[0]);
    const recommended = bids[0]; // Highest overall score

    return {
      intentId: intent.id,
      status: intent.status,
      prompt: intent.params.prompt,
      llmBids: bids,
      comparison: {
        cheapest: cheapest?.modelId || '',
        fastest: fastest?.modelId || '',
        highestQuality: highestQuality?.modelId || '',
        bestValue: bestValue?.modelId || '',
        recommended: recommended?.modelId || '',
      },
      totalCost: bids.reduce((sum, b) => sum + b.cost, 0),
      avgLatency: bids.reduce((sum, b) => sum + b.latency, 0) / bids.length,
      biddingDeadline: intent.biddingDeadline,
      userCanSelect: intent.status === IntentStatus.OPEN || intent.status === IntentStatus.BIDDING_CLOSED,
    };
  }

  getOpenIntents(): LLMIntent[] {
    return Array.from(this.intents.values())
      .filter(i => i.status === IntentStatus.OPEN);
  }

  getIntentsByClient(clientAddress: string): LLMIntent[] {
    return Array.from(this.intents.values())
      .filter(i => i.clientAddress === clientAddress);
  }

  // -------------------- PROVIDER MANAGEMENT --------------------

  getProviders(): LLMProvider[] {
    return Array.from(this.llmProviders.values());
  }

  getProvider(id: string): LLMProvider | undefined {
    return this.llmProviders.get(id);
  }

  registerProvider(provider: LLMProvider): void {
    this.llmProviders.set(provider.id, provider);
  }
}

// Singleton instance
let bridgeInstance: LLMIntentBridge | null = null;

export function getLLMIntentBridge(): LLMIntentBridge {
  if (!bridgeInstance) {
    bridgeInstance = new LLMIntentBridge();
  }
  return bridgeInstance;
}

export function resetLLMIntentBridge(): void {
  bridgeInstance = null;
}
