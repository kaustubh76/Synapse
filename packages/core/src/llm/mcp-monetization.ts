// ============================================================
// SYNAPSE MCP MONETIZATION SDK
// One-liner to monetize any MCP server
// ============================================================

import { EventEmitter } from 'events';
import { MCPToolPricing, MCPPricingModel, MCPEarningsReport, CreditTier } from './types.js';
import { nanoid } from 'nanoid';

export interface MonetizeConfig {
  serverId: string;
  serverName: string;
  recipient: string; // Wallet address for earnings

  // Default pricing (applied to all tools)
  defaultPricing: MCPPricingModel;

  // Per-tool pricing overrides
  toolPricing?: Record<string, MCPPricingModel>;

  // Revenue split
  revenueSplit?: {
    toolCreator?: number;
    serverOperator?: number;
    platform?: number;
  };

  // Discounts
  volumeDiscounts?: Array<{ minCalls: number; discount: number }>;
  creditTierDiscounts?: Partial<Record<CreditTier, number>>;
  daoDiscount?: number;
}

export interface ToolCall {
  id: string;
  toolName: string;
  agentId: string;
  creditTier: CreditTier;
  isDaoMember: boolean;
  inputSize?: number; // For per-KB pricing
  outputSize?: number;
  executionTime?: number; // For per-minute pricing
  timestamp: number;
}

export interface ToolCallResult {
  callId: string;
  price: number;
  discountApplied: number;
  finalPrice: number;
  earnings: {
    toolCreator: number;
    serverOperator: number;
    platform: number;
  };
}

export class MCPMonetizationService extends EventEmitter {
  private servers: Map<string, MonetizeConfig> = new Map();
  private toolPricings: Map<string, MCPToolPricing> = new Map();
  private callHistory: Map<string, ToolCall[]> = new Map();
  private earnings: Map<string, number> = new Map();

  // -------------------- SERVER REGISTRATION --------------------

  registerServer(config: MonetizeConfig): void {
    // Validate revenue split
    const defaultSplit = {
      toolCreator: 0.70,
      serverOperator: 0.00,
      platform: 0.30,
    };

    const split = {
      toolCreator: config.revenueSplit?.toolCreator ?? defaultSplit.toolCreator,
      serverOperator: config.revenueSplit?.serverOperator ?? defaultSplit.serverOperator,
      platform: config.revenueSplit?.platform ?? defaultSplit.platform,
    };

    // Ensure splits add up to 1
    const total = split.toolCreator + split.serverOperator + split.platform;
    if (Math.abs(total - 1.0) > 0.01) {
      throw new Error(`Revenue split must add up to 1.0, got ${total}`);
    }

    config.revenueSplit = split as { toolCreator: number; serverOperator: number; platform: number };

    this.servers.set(config.serverId, config);

    this.emit('server_registered', { serverId: config.serverId, config });
  }

  getServer(serverId: string): MonetizeConfig | undefined {
    return this.servers.get(serverId);
  }

  // -------------------- TOOL PRICING --------------------

  getToolPricing(serverId: string, toolName: string): MCPToolPricing {
    const key = `${serverId}:${toolName}`;

    if (this.toolPricings.has(key)) {
      return this.toolPricings.get(key)!;
    }

    // Create from server config
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    const pricingModel =
      server.toolPricing?.[toolName] || server.defaultPricing;

    const pricing: MCPToolPricing = {
      toolName,
      serverId,
      pricingModel,
      revenueSplit: server.revenueSplit as { toolCreator: number; serverOperator: number; platform: number },
      discounts: {
        volumeDiscounts: server.volumeDiscounts || [],
        creditTierDiscounts: server.creditTierDiscounts || {},
        daoDiscount: server.daoDiscount || 0,
      },
      totalCalls: 0,
      totalRevenue: 0,
      avgResponseTime: 0,
    };

    this.toolPricings.set(key, pricing);

    return pricing;
  }

  // -------------------- PRICE CALCULATION --------------------

  calculatePrice(
    serverId: string,
    toolName: string,
    call: Omit<ToolCall, 'id' | 'timestamp'>
  ): number {
    const pricing = this.getToolPricing(serverId, toolName);
    let basePrice = 0;

    // Calculate base price based on pricing model
    switch (pricing.pricingModel.type) {
      case 'per_call':
        basePrice = pricing.pricingModel.price;
        break;

      case 'per_token':
        const inputTokens = call.inputSize || 0;
        const outputTokens = call.outputSize || 0;
        basePrice =
          (inputTokens / 1_000_000) * pricing.pricingModel.inputPrice +
          (outputTokens / 1_000_000) * pricing.pricingModel.outputPrice;
        break;

      case 'per_kb':
        const totalKB = ((call.inputSize || 0) + (call.outputSize || 0)) / 1024;
        basePrice = totalKB * pricing.pricingModel.price;
        break;

      case 'per_minute':
        const minutes = (call.executionTime || 0) / 60000;
        basePrice = minutes * pricing.pricingModel.price;
        break;

      case 'subscription':
        // Check if agent has exceeded their quota
        const agentCalls = this.getAgentCallCount(serverId, toolName, call.agentId);
        if (agentCalls < pricing.pricingModel.callLimit) {
          basePrice = 0; // Within quota
        } else {
          basePrice = pricing.pricingModel.overage; // Overage charge
        }
        break;

      case 'freemium':
        const totalCalls = this.getAgentCallCount(serverId, toolName, call.agentId);
        if (totalCalls < pricing.pricingModel.freeCalls) {
          basePrice = 0; // Free tier
        } else {
          basePrice = pricing.pricingModel.paidPrice;
        }
        break;

      case 'tiered':
        const callCount = this.getAgentCallCount(serverId, toolName, call.agentId);
        const tier = pricing.pricingModel.tiers.find(
          t => callCount >= t.minCalls && callCount <= t.maxCalls
        );
        basePrice = tier ? tier.pricePerCall : pricing.pricingModel.tiers[0].pricePerCall;
        break;
    }

    return basePrice;
  }

  calculateDiscount(
    serverId: string,
    toolName: string,
    call: Omit<ToolCall, 'id' | 'timestamp'>,
    basePrice: number
  ): number {
    const pricing = this.getToolPricing(serverId, toolName);
    let totalDiscount = 0;

    // Volume discount
    const agentCalls = this.getAgentCallCount(serverId, toolName, call.agentId);
    for (const vd of pricing.discounts.volumeDiscounts) {
      if (agentCalls >= vd.minCalls) {
        totalDiscount = Math.max(totalDiscount, vd.discount);
      }
    }

    // Credit tier discount
    const tierDiscount = pricing.discounts.creditTierDiscounts[call.creditTier];
    if (tierDiscount) {
      totalDiscount = Math.max(totalDiscount, tierDiscount);
    }

    // DAO discount
    if (call.isDaoMember && pricing.discounts.daoDiscount > 0) {
      totalDiscount = Math.max(totalDiscount, pricing.discounts.daoDiscount);
    }

    return Math.min(basePrice * totalDiscount, basePrice); // Cap at 100% discount
  }

  // -------------------- TOOL CALL PROCESSING --------------------

  async processToolCall(
    serverId: string,
    toolName: string,
    callData: Omit<ToolCall, 'id' | 'timestamp'>
  ): Promise<ToolCallResult> {
    const callId = `call_${nanoid()}`;

    const call: ToolCall = {
      ...callData,
      id: callId,
      toolName,
      timestamp: Date.now(),
    };

    // Calculate price
    const basePrice = this.calculatePrice(serverId, toolName, callData);
    const discount = this.calculateDiscount(serverId, toolName, callData, basePrice);
    const finalPrice = Math.max(0, basePrice - discount);

    // Calculate earnings split
    const pricing = this.getToolPricing(serverId, toolName);
    const split = pricing.revenueSplit;

    const earnings = {
      toolCreator: finalPrice * split.toolCreator,
      serverOperator: finalPrice * split.serverOperator,
      platform: finalPrice * split.platform,
    };

    // Record call
    const key = `${serverId}:${toolName}`;
    const calls = this.callHistory.get(key) || [];
    calls.push(call);
    this.callHistory.set(key, calls);

    // Update pricing stats
    pricing.totalCalls++;
    pricing.totalRevenue += finalPrice;
    if (call.executionTime) {
      pricing.avgResponseTime =
        (pricing.avgResponseTime * (pricing.totalCalls - 1) + call.executionTime) /
        pricing.totalCalls;
    }

    // Track earnings
    const currentEarnings = this.earnings.get(serverId) || 0;
    this.earnings.set(serverId, currentEarnings + earnings.serverOperator + earnings.toolCreator);

    this.emit('tool_call_processed', {
      serverId,
      toolName,
      callId,
      finalPrice,
      earnings,
    });

    return {
      callId,
      price: basePrice,
      discountApplied: discount,
      finalPrice,
      earnings,
    };
  }

  // -------------------- EARNINGS REPORTS --------------------

  getEarningsReport(
    serverId: string,
    startTime: number,
    endTime: number
  ): MCPEarningsReport {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    // Get all tool calls for this server in the time range
    const allCalls: ToolCall[] = [];
    for (const [key, calls] of this.callHistory.entries()) {
      if (key.startsWith(`${serverId}:`)) {
        const filteredCalls = calls.filter(
          c => c.timestamp >= startTime && c.timestamp <= endTime
        );
        allCalls.push(...filteredCalls);
      }
    }

    const totalCalls = allCalls.length;
    const uniqueCallers = new Set(allCalls.map(c => c.agentId)).size;

    // Calculate total earnings
    let totalEarnings = 0;
    const byTool: Map<string, { calls: number; earnings: number; callers: Set<string> }> = new Map();

    for (const call of allCalls) {
      const result = this.calculatePrice(serverId, call.toolName, call);
      const discount = this.calculateDiscount(serverId, call.toolName, call, result);
      const finalPrice = result - discount;

      totalEarnings += finalPrice;

      if (!byTool.has(call.toolName)) {
        byTool.set(call.toolName, { calls: 0, earnings: 0, callers: new Set() });
      }

      const toolStats = byTool.get(call.toolName)!;
      toolStats.calls++;
      toolStats.earnings += finalPrice;
      toolStats.callers.add(call.agentId);
    }

    const avgRevenuePerCall = totalCalls > 0 ? totalEarnings / totalCalls : 0;

    // Project future earnings
    const durationMs = endTime - startTime;
    const durationDays = durationMs / (24 * 60 * 60 * 1000);

    const dailyRate = durationDays > 0 ? totalEarnings / durationDays : 0;
    const growthRate = this.calculateGrowthRate(serverId);

    return {
      serverId,
      period: { start: startTime, end: endTime },
      totalEarnings,
      totalCalls,
      uniqueCallers,
      avgRevenuePerCall,
      byTool: Array.from(byTool.entries()).map(([toolName, stats]) => ({
        toolName,
        calls: stats.calls,
        earnings: stats.earnings,
        avgPrice: stats.earnings / stats.calls,
        topCallers: Array.from(stats.callers).slice(0, 5),
      })),
      projections: {
        daily: dailyRate,
        weekly: dailyRate * 7,
        monthly: dailyRate * 30,
        growthRate,
      },
    };
  }

  private calculateGrowthRate(serverId: string): number {
    // Simple growth calculation based on last 7 days vs previous 7 days
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

    const recent = this.getEarningsReport(serverId, sevenDaysAgo, now);
    const previous = this.getEarningsReport(serverId, fourteenDaysAgo, sevenDaysAgo);

    if (previous.totalEarnings === 0) return 0;

    return (recent.totalEarnings - previous.totalEarnings) / previous.totalEarnings;
  }

  // -------------------- HELPERS --------------------

  private getAgentCallCount(serverId: string, toolName: string, agentId: string): number {
    const key = `${serverId}:${toolName}`;
    const calls = this.callHistory.get(key) || [];
    return calls.filter(c => c.agentId === agentId).length;
  }

  getTotalEarnings(serverId: string): number {
    return this.earnings.get(serverId) || 0;
  }

  getAllServers(): MonetizeConfig[] {
    return Array.from(this.servers.values());
  }
}

// -------------------- SIMPLIFIED API --------------------

export function monetize(config: MonetizeConfig): MCPMonetizationService {
  const service = new MCPMonetizationService();
  service.registerServer(config);
  return service;
}

// Helper for common pricing models
export const PerCallPricing = (price: number): MCPPricingModel => ({
  type: 'per_call',
  price,
});

export const PerTokenPricing = (
  inputPrice: number,
  outputPrice: number
): MCPPricingModel => ({
  type: 'per_token',
  inputPrice,
  outputPrice,
});

export const PerKBPricing = (price: number): MCPPricingModel => ({
  type: 'per_kb',
  price,
});

export const PerMinutePricing = (price: number): MCPPricingModel => ({
  type: 'per_minute',
  price,
});

export const FreemiumPricing = (
  freeCalls: number,
  paidPrice: number
): MCPPricingModel => ({
  type: 'freemium',
  freeCalls,
  paidPrice,
});

export const SubscriptionPricing = (
  monthly: number,
  callLimit: number,
  overage: number
): MCPPricingModel => ({
  type: 'subscription',
  monthly,
  callLimit,
  overage,
});

// -------------------- SINGLETON --------------------

let monetizationInstance: MCPMonetizationService | null = null;

export function getMCPMonetizationService(): MCPMonetizationService {
  if (!monetizationInstance) {
    monetizationInstance = new MCPMonetizationService();
  }
  return monetizationInstance;
}

export function resetMCPMonetizationService(): void {
  monetizationInstance = null;
}
