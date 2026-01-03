// ============================================================
// SYNAPSE Dispute Resolution System
// Automated dispute handling with evidence collection
// NOW WITH REAL ORACLE INTEGRATION (CoinGecko, Open-Meteo)
// AND REAL USDC SLASHING (on-chain transfers)
// ============================================================

import { EventEmitter } from 'eventemitter3';
import { nanoid } from 'nanoid';
import { getRealToolProvider } from './tools/real-tool-providers.js';
import { getEscrowManager, EscrowManager } from './escrow-manager.js';

// -------------------- DISPUTE CONFIGURATION --------------------

export interface DisputeResolverConfig {
  /** Use real oracles (CoinGecko, Open-Meteo) instead of hardcoded values */
  enableRealOracles?: boolean;
  /** Enable real USDC slashing on-chain when disputes resolve against provider */
  enableRealSlashing?: boolean;
  /** Evidence collection timeout in ms */
  evidenceTimeoutMs?: number;
  /** Deviation threshold for provider fault (default: 5%) */
  deviationThreshold?: number;
  /** Percentage to slash on provider fault (default: 10%) */
  slashPercentage?: number;
  /** Minimum reputation penalty */
  minReputationPenalty?: number;
  /** Maximum reputation penalty */
  maxReputationPenalty?: number;
  /** Platform wallet address to receive slashed funds */
  platformWalletAddress?: string;
}

export enum DisputeStatus {
  OPENED = 'OPENED',
  EVIDENCE_COLLECTION = 'EVIDENCE_COLLECTION',
  UNDER_REVIEW = 'UNDER_REVIEW',
  RESOLVED_CLIENT_WINS = 'RESOLVED_CLIENT_WINS',
  RESOLVED_PROVIDER_WINS = 'RESOLVED_PROVIDER_WINS',
  RESOLVED_SPLIT = 'RESOLVED_SPLIT',
  EXPIRED = 'EXPIRED'
}

export enum DisputeReason {
  INCORRECT_DATA = 'INCORRECT_DATA',
  NO_RESPONSE = 'NO_RESPONSE',
  LATE_RESPONSE = 'LATE_RESPONSE',
  QUALITY_ISSUE = 'QUALITY_ISSUE',
  MALICIOUS_BEHAVIOR = 'MALICIOUS_BEHAVIOR',
  OTHER = 'OTHER'
}

export interface DisputeEvidence {
  id: string;
  disputeId: string;
  submittedBy: 'client' | 'provider' | 'oracle';
  type: 'execution_proof' | 'reference_data' | 'timing_log' | 'attestation' | 'other';
  data: any;
  timestamp: number;
}

export interface Dispute {
  id: string;
  intentId: string;
  escrowId: string;
  clientAddress: string;
  providerAddress: string;
  reason: DisputeReason;
  description: string;
  status: DisputeStatus;
  evidence: DisputeEvidence[];
  createdAt: number;
  resolvedAt?: number;
  resolution?: {
    verdict: 'client_wins' | 'provider_wins' | 'split';
    clientRefund: number;
    providerPayment: number;
    slashAmount: number;
    reputationPenalty: number;
    explanation: string;
  };
  /** On-chain slashing transaction details (when enableRealSlashing=true) */
  slashingTx?: {
    txHash: string;
    blockNumber?: number;
    explorerUrl?: string;
    slashedAmountUSDC: number;
    recipient: string;
    executedAt: number;
  };
  deviationPercent?: number;
  referenceValue?: any;
  providedValue?: any;
}

export interface DisputeOpenRequest {
  intentId: string;
  escrowId: string;
  clientAddress: string;
  providerAddress: string;
  reason: DisputeReason;
  description: string;
  providedValue: any;
  expectedValue?: any;
}

interface DisputeResolverEvents {
  'dispute:opened': (dispute: Dispute) => void;
  'dispute:evidence': (dispute: Dispute, evidence: DisputeEvidence) => void;
  'dispute:resolved': (dispute: Dispute) => void;
  'dispute:expired': (dispute: Dispute) => void;
}

// Reference oracles for data validation
interface ReferenceOracle {
  name: string;
  type: string;
  getValue: (params: any) => Promise<any>;
}

/**
 * Dispute Resolver
 *
 * Handles disputes between clients and providers.
 * Uses automated evidence collection and reference oracles.
 *
 * NOW SUPPORTS REAL ORACLES (CoinGecko, Open-Meteo)!
 */
export class DisputeResolver extends EventEmitter<DisputeResolverEvents> {
  private disputes: Map<string, Dispute> = new Map();
  private disputesByIntent: Map<string, string> = new Map();
  private referenceOracles: Map<string, ReferenceOracle> = new Map();
  private config: Required<DisputeResolverConfig>;
  private escrowManager: EscrowManager;

  constructor(config: DisputeResolverConfig = {}) {
    super();
    // Default to REAL oracles and slashing unless explicitly disabled
    this.config = {
      enableRealOracles: config.enableRealOracles ?? (process.env.ENABLE_REAL_ORACLES !== 'false'),
      enableRealSlashing: config.enableRealSlashing ?? (process.env.ENABLE_REAL_SLASHING !== 'false'),
      evidenceTimeoutMs: config.evidenceTimeoutMs ?? 300000,    // 5 minutes
      deviationThreshold: config.deviationThreshold ?? 0.05,    // 5%
      slashPercentage: config.slashPercentage ?? 0.1,           // 10%
      minReputationPenalty: config.minReputationPenalty ?? 0.1,
      maxReputationPenalty: config.maxReputationPenalty ?? 0.5,
      platformWalletAddress: config.platformWalletAddress ?? process.env.PLATFORM_WALLET ?? '',
    };

    // Initialize escrow manager for slashing operations
    this.escrowManager = getEscrowManager();

    if (this.config.enableRealOracles) {
      console.log('[DisputeResolver] REAL oracles ENABLED (CoinGecko, Open-Meteo)');
      this.registerRealOracles();
    } else {
      console.log('[DisputeResolver] Simulated oracles enabled (ENABLE_REAL_ORACLES=false)');
      this.registerDefaultOracles();
    }

    if (this.config.enableRealSlashing) {
      console.log('[DisputeResolver] REAL USDC slashing ENABLED (on-chain transfers)');
      if (!this.config.platformWalletAddress) {
        console.warn('[DisputeResolver] ⚠️  PLATFORM_WALLET not set - slashed funds will go to escrow wallet');
      }
    } else {
      console.log('[DisputeResolver] Simulated slashing enabled (ENABLE_REAL_SLASHING=false)');
    }
  }

  /**
   * Register default reference oracles (simulated, for backward compatibility)
   */
  private registerDefaultOracles(): void {
    // Crypto price oracle (simulated)
    this.referenceOracles.set('crypto.price', {
      name: 'SimulatedCryptoOracle',
      type: 'crypto.price',
      getValue: async (params: { symbol: string }) => {
        // Simulated prices
        const prices: Record<string, number> = {
          'BTC': 98500,
          'ETH': 3850,
          'SOL': 245
        };
        console.log(`[DisputeResolver] Simulated crypto oracle: ${params.symbol} = $${prices[params.symbol.toUpperCase()]}`);
        return prices[params.symbol.toUpperCase()] || null;
      }
    });

    // Weather oracle (simulated)
    this.referenceOracles.set('weather.current', {
      name: 'SimulatedWeatherOracle',
      type: 'weather.current',
      getValue: async (params: { city: string }) => {
        const temp = 72 + Math.random() * 5 - 2.5;
        console.log(`[DisputeResolver] Simulated weather oracle: ${params.city} = ${temp.toFixed(1)}°F`);
        return {
          temperature: temp,
          condition: 'Clear'
        };
      }
    });
  }

  /**
   * Register REAL reference oracles (CoinGecko, Open-Meteo)
   */
  private registerRealOracles(): void {
    const toolProvider = getRealToolProvider();

    // REAL Crypto price oracle (CoinGecko)
    this.referenceOracles.set('crypto.price', {
      name: 'CoinGecko',
      type: 'crypto.price',
      getValue: async (params: { symbol: string }) => {
        console.log(`[DisputeResolver] Querying REAL CoinGecko oracle for ${params.symbol}...`);

        const result = await toolProvider.getCryptoPrice(params.symbol);

        if (result.success && result.data) {
          console.log(`[DisputeResolver] CoinGecko: ${params.symbol} = $${result.data.price}`);
          console.log(`[DisputeResolver]   24h Change: ${result.data.change24h}%`);
          console.log(`[DisputeResolver]   Source: ${result.source}`);
          return result.data.price;
        }

        console.log(`[DisputeResolver] CoinGecko query failed: ${result.error}`);
        return null;
      }
    });

    // REAL Weather oracle (Open-Meteo)
    this.referenceOracles.set('weather.current', {
      name: 'Open-Meteo',
      type: 'weather.current',
      getValue: async (params: { city: string }) => {
        console.log(`[DisputeResolver] Querying REAL Open-Meteo oracle for ${params.city}...`);

        const result = await toolProvider.getWeather(params.city);

        if (result.success && result.data) {
          console.log(`[DisputeResolver] Open-Meteo: ${params.city} = ${result.data.temperature}°C`);
          console.log(`[DisputeResolver]   Condition: ${result.data.condition}`);
          console.log(`[DisputeResolver]   Source: ${result.source}`);
          return {
            temperature: result.data.temperature,
            condition: result.data.condition,
            humidity: result.data.humidity,
            wind: result.data.wind,
          };
        }

        console.log(`[DisputeResolver] Open-Meteo query failed: ${result.error}`);
        return null;
      }
    });

    // REAL News oracle (HackerNews/NewsAPI)
    this.referenceOracles.set('news.latest', {
      name: 'NewsOracle',
      type: 'news.latest',
      getValue: async (params: { query?: string }) => {
        console.log(`[DisputeResolver] Querying REAL news oracle for "${params.query || 'latest'}"...`);

        const result = await toolProvider.getNews(params.query);

        if (result.success && result.data) {
          console.log(`[DisputeResolver] News: Found ${result.data.totalResults} articles`);
          console.log(`[DisputeResolver]   Source: ${result.source}`);
          return {
            articles: result.data.articles.length,
            source: result.source,
          };
        }

        console.log(`[DisputeResolver] News query failed: ${result.error}`);
        return null;
      }
    });
  }

  /**
   * Register a custom reference oracle
   */
  registerOracle(oracle: ReferenceOracle): void {
    this.referenceOracles.set(oracle.type, oracle);
  }

  /**
   * Open a new dispute
   */
  async openDispute(request: DisputeOpenRequest): Promise<Dispute> {
    // Check for existing dispute
    if (this.disputesByIntent.has(request.intentId)) {
      throw new Error(`Dispute already exists for intent ${request.intentId}`);
    }

    const disputeId = `disp_${nanoid(12)}`;
    const now = Date.now();

    const dispute: Dispute = {
      id: disputeId,
      intentId: request.intentId,
      escrowId: request.escrowId,
      clientAddress: request.clientAddress,
      providerAddress: request.providerAddress,
      reason: request.reason,
      description: request.description,
      status: DisputeStatus.OPENED,
      evidence: [],
      createdAt: now,
      providedValue: request.providedValue
    };

    this.disputes.set(disputeId, dispute);
    this.disputesByIntent.set(request.intentId, disputeId);

    this.emit('dispute:opened', dispute);

    // Start evidence collection
    await this.collectEvidence(disputeId, request.providedValue, request.expectedValue);

    return dispute;
  }

  /**
   * Collect evidence for a dispute
   */
  private async collectEvidence(
    disputeId: string,
    providedValue: any,
    expectedValue?: any
  ): Promise<void> {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) return;

    dispute.status = DisputeStatus.EVIDENCE_COLLECTION;

    // Add provider's submitted value as evidence
    this.addEvidence(disputeId, {
      submittedBy: 'provider',
      type: 'execution_proof',
      data: { value: providedValue }
    });

    // If expected value provided, add as client evidence
    if (expectedValue !== undefined) {
      this.addEvidence(disputeId, {
        submittedBy: 'client',
        type: 'reference_data',
        data: { expectedValue }
      });
    }

    // Query reference oracles for ground truth
    await this.queryReferenceOracles(disputeId);

    // Auto-resolve based on evidence
    await this.autoResolve(disputeId);
  }

  /**
   * Add evidence to a dispute
   */
  addEvidence(disputeId: string, evidence: Omit<DisputeEvidence, 'id' | 'disputeId' | 'timestamp'>): DisputeEvidence {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) throw new Error(`Dispute ${disputeId} not found`);

    const fullEvidence: DisputeEvidence = {
      id: `evd_${nanoid(8)}`,
      disputeId,
      timestamp: Date.now(),
      ...evidence
    };

    dispute.evidence.push(fullEvidence);
    this.disputes.set(disputeId, dispute);
    this.emit('dispute:evidence', dispute, fullEvidence);

    return fullEvidence;
  }

  /**
   * Query reference oracles for ground truth
   */
  private async queryReferenceOracles(disputeId: string): Promise<void> {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) return;

    // Determine intent type from the dispute context
    // In production, this would be passed with the dispute
    const intentType = this.inferIntentType(dispute);

    const oracle = this.referenceOracles.get(intentType);
    if (!oracle) {
      console.log(`No oracle available for ${intentType}`);
      return;
    }

    try {
      // Get reference value from oracle
      const referenceValue = await oracle.getValue(dispute.providedValue);

      if (referenceValue !== null) {
        dispute.referenceValue = referenceValue;

        this.addEvidence(disputeId, {
          submittedBy: 'oracle',
          type: 'reference_data',
          data: {
            oracle: oracle.name,
            value: referenceValue
          }
        });
      }
    } catch (error) {
      console.error(`Oracle query failed: ${error}`);
    }
  }

  /**
   * Infer intent type from dispute context
   */
  private inferIntentType(dispute: Dispute): string {
    const providedValue = dispute.providedValue;

    if (providedValue?.symbol || providedValue?.price) {
      return 'crypto.price';
    }
    if (providedValue?.temperature || providedValue?.city) {
      return 'weather.current';
    }
    return 'unknown';
  }

  /**
   * Automatically resolve dispute based on evidence
   */
  private async autoResolve(disputeId: string): Promise<void> {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) return;

    dispute.status = DisputeStatus.UNDER_REVIEW;

    // Get provided value and reference value
    const providedValue = this.extractNumericValue(dispute.providedValue);
    const referenceValue = this.extractNumericValue(dispute.referenceValue);

    if (providedValue === null || referenceValue === null) {
      // Can't auto-resolve without numeric comparison
      // In production, this would go to manual review
      dispute.status = DisputeStatus.RESOLVED_SPLIT;
      dispute.resolution = {
        verdict: 'split',
        clientRefund: 0.5,    // 50% refund
        providerPayment: 0.5, // 50% payment
        slashAmount: 0,
        reputationPenalty: 0,
        explanation: 'Unable to determine fault - splitting escrow'
      };
      dispute.resolvedAt = Date.now();
      this.disputes.set(disputeId, dispute);
      this.emit('dispute:resolved', dispute);
      return;
    }

    // Calculate deviation
    const deviation = Math.abs(providedValue - referenceValue) / referenceValue;
    dispute.deviationPercent = deviation * 100;

    // Determine verdict based on deviation threshold
    if (deviation > this.config.deviationThreshold) {
      // Provider fault - significant deviation
      const slashAmount = this.config.slashPercentage;
      const reputationPenalty = Math.min(
        this.config.maxReputationPenalty,
        this.config.minReputationPenalty + deviation * 0.5
      );

      dispute.status = DisputeStatus.RESOLVED_CLIENT_WINS;
      dispute.resolution = {
        verdict: 'client_wins',
        clientRefund: 1.0,          // Full refund
        providerPayment: 0,
        slashAmount,
        reputationPenalty,
        explanation: `Provider data deviated ${(deviation * 100).toFixed(1)}% from reference (threshold: ${this.config.deviationThreshold * 100}%)`
      };

      // Execute real on-chain slashing if enabled
      if (this.config.enableRealSlashing) {
        await this.executeSlashing(dispute, slashAmount);
      }
    } else {
      // Provider correct - within tolerance
      dispute.status = DisputeStatus.RESOLVED_PROVIDER_WINS;
      dispute.resolution = {
        verdict: 'provider_wins',
        clientRefund: 0,
        providerPayment: 1.0,       // Full payment
        slashAmount: 0,
        reputationPenalty: 0,
        explanation: `Provider data within acceptable tolerance (${(deviation * 100).toFixed(1)}% deviation)`
      };
    }

    dispute.resolvedAt = Date.now();
    this.disputes.set(disputeId, dispute);
    this.emit('dispute:resolved', dispute);
  }

  /**
   * Execute real USDC slashing on-chain
   * Called when a dispute resolves in favor of the client
   */
  private async executeSlashing(dispute: Dispute, slashPercentage: number): Promise<void> {
    try {
      const escrow = this.escrowManager.getEscrow(dispute.escrowId);
      if (!escrow) {
        console.warn(`[DisputeResolver] Escrow ${dispute.escrowId} not found - skipping slashing`);
        return;
      }

      // Calculate actual USDC amount to slash
      const slashAmountUSDC = escrow.amount * slashPercentage;

      // Determine recipient (platform wallet or fallback to client)
      const recipient = this.config.platformWalletAddress || dispute.clientAddress;

      console.log(`[DisputeResolver] Executing on-chain slashing...`);
      console.log(`[DisputeResolver]   Dispute: ${dispute.id}`);
      console.log(`[DisputeResolver]   Escrow: ${dispute.escrowId}`);
      console.log(`[DisputeResolver]   Provider: ${dispute.providerAddress}`);
      console.log(`[DisputeResolver]   Slash Amount: $${slashAmountUSDC.toFixed(6)} USDC (${(slashPercentage * 100).toFixed(1)}%)`);
      console.log(`[DisputeResolver]   Recipient: ${recipient}`);

      // Execute the slash via EscrowManager (handles real USDC transfer)
      const result = await this.escrowManager.slash(
        dispute.escrowId,
        slashAmountUSDC,
        recipient,
        `Dispute ${dispute.id}: ${dispute.resolution?.explanation || 'Provider fault'}`
      );

      // Record the slashing transaction on the dispute
      dispute.slashingTx = {
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        explorerUrl: result.explorerUrl,
        slashedAmountUSDC: result.slashedAmount,
        recipient,
        executedAt: Date.now(),
      };

      console.log(`[DisputeResolver] ✅ Slashing executed successfully!`);
      console.log(`[DisputeResolver]   TX Hash: ${result.txHash}`);
      if (result.blockNumber) {
        console.log(`[DisputeResolver]   Block: ${result.blockNumber}`);
      }
      if (result.explorerUrl) {
        console.log(`[DisputeResolver]   Explorer: ${result.explorerUrl}`);
      }

    } catch (error) {
      console.error(`[DisputeResolver] ❌ Slashing failed:`, error);
      // Log the error but don't fail the dispute resolution
      // The dispute is already resolved, slashing is a secondary action
    }
  }

  /**
   * Extract numeric value from various data formats
   */
  private extractNumericValue(data: any): number | null {
    if (typeof data === 'number') return data;
    if (typeof data === 'object' && data !== null) {
      // Try common fields
      if (typeof data.price === 'number') return data.price;
      if (typeof data.temperature === 'number') return data.temperature;
      if (typeof data.value === 'number') return data.value;
    }
    return null;
  }

  /**
   * Get dispute by ID
   */
  getDispute(disputeId: string): Dispute | undefined {
    return this.disputes.get(disputeId);
  }

  /**
   * Get dispute by intent ID
   */
  getDisputeByIntent(intentId: string): Dispute | undefined {
    const disputeId = this.disputesByIntent.get(intentId);
    if (!disputeId) return undefined;
    return this.disputes.get(disputeId);
  }

  /**
   * Get all disputes for a client
   */
  getClientDisputes(clientAddress: string): Dispute[] {
    return Array.from(this.disputes.values())
      .filter(d => d.clientAddress === clientAddress);
  }

  /**
   * Get all disputes for a provider
   */
  getProviderDisputes(providerAddress: string): Dispute[] {
    return Array.from(this.disputes.values())
      .filter(d => d.providerAddress === providerAddress);
  }

  /**
   * Get dispute statistics
   */
  getStats(): {
    totalDisputes: number;
    openDisputes: number;
    clientWins: number;
    providerWins: number;
    splits: number;
    avgDeviationPercent: number;
  } {
    const disputes = Array.from(this.disputes.values());
    const resolved = disputes.filter(d => d.resolvedAt);

    const clientWins = resolved.filter(d => d.status === DisputeStatus.RESOLVED_CLIENT_WINS).length;
    const providerWins = resolved.filter(d => d.status === DisputeStatus.RESOLVED_PROVIDER_WINS).length;
    const splits = resolved.filter(d => d.status === DisputeStatus.RESOLVED_SPLIT).length;

    const avgDeviation = resolved
      .filter(d => d.deviationPercent !== undefined)
      .reduce((sum, d) => sum + (d.deviationPercent || 0), 0) / (resolved.length || 1);

    return {
      totalDisputes: disputes.length,
      openDisputes: disputes.filter(d => !d.resolvedAt).length,
      clientWins,
      providerWins,
      splits,
      avgDeviationPercent: avgDeviation
    };
  }

  /**
   * Clear all disputes (for testing)
   */
  clear(): void {
    this.disputes.clear();
    this.disputesByIntent.clear();
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<DisputeResolverConfig> {
    return { ...this.config };
  }

  /**
   * Check if real oracles are enabled
   */
  isRealOraclesEnabled(): boolean {
    return this.config.enableRealOracles;
  }

  /**
   * Check if real USDC slashing is enabled
   */
  isRealSlashingEnabled(): boolean {
    return this.config.enableRealSlashing;
  }

  /**
   * Get list of registered oracles
   */
  getRegisteredOracles(): string[] {
    return Array.from(this.referenceOracles.keys());
  }

  /**
   * Get all disputes (for admin/monitoring)
   */
  getAllDisputes(): Dispute[] {
    return Array.from(this.disputes.values());
  }

  /**
   * Get disputes with slashing transactions
   */
  getSlashedDisputes(): Dispute[] {
    return Array.from(this.disputes.values()).filter(d => d.slashingTx !== undefined);
  }
}

// Singleton instance
let disputeResolverInstance: DisputeResolver | null = null;

export function getDisputeResolver(config?: DisputeResolverConfig): DisputeResolver {
  if (!disputeResolverInstance) {
    disputeResolverInstance = new DisputeResolver(config);
  }
  return disputeResolverInstance;
}

export function resetDisputeResolver(): void {
  disputeResolverInstance = null;
}
