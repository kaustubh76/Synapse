// ============================================================
// SYNAPSE Dispute Resolution System
// Automated dispute handling with evidence collection
// ============================================================

import { EventEmitter } from 'eventemitter3';
import { nanoid } from 'nanoid';

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
 */
export class DisputeResolver extends EventEmitter<DisputeResolverEvents> {
  private disputes: Map<string, Dispute> = new Map();
  private disputesByIntent: Map<string, string> = new Map();
  private referenceOracles: Map<string, ReferenceOracle> = new Map();
  private config = {
    evidenceTimeoutMs: 300000,    // 5 minutes for evidence collection
    deviationThreshold: 0.05,     // 5% deviation triggers client win
    slashPercentage: 0.1,         // 10% slash on provider fault
    minReputationPenalty: 0.1,
    maxReputationPenalty: 0.5
  };

  constructor() {
    super();
    this.registerDefaultOracles();
  }

  /**
   * Register default reference oracles
   */
  private registerDefaultOracles(): void {
    // Crypto price oracle
    this.referenceOracles.set('crypto.price', {
      name: 'CryptoOracle',
      type: 'crypto.price',
      getValue: async (params: { symbol: string }) => {
        // Simulate reference price (in production, aggregate from multiple sources)
        const prices: Record<string, number> = {
          'BTC': 98500,
          'ETH': 3850,
          'SOL': 245
        };
        return prices[params.symbol.toUpperCase()] || null;
      }
    });

    // Weather oracle
    this.referenceOracles.set('weather.current', {
      name: 'WeatherOracle',
      type: 'weather.current',
      getValue: async (params: { city: string }) => {
        // Simulate reference weather (in production, aggregate from weather APIs)
        return {
          temperature: 72 + Math.random() * 5 - 2.5,
          condition: 'Clear'
        };
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
}

// Singleton instance
let disputeResolverInstance: DisputeResolver | null = null;

export function getDisputeResolver(): DisputeResolver {
  if (!disputeResolverInstance) {
    disputeResolverInstance = new DisputeResolver();
  }
  return disputeResolverInstance;
}

export function resetDisputeResolver(): void {
  disputeResolverInstance = null;
}
