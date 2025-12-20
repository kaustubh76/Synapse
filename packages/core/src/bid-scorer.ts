// ============================================================
// SYNAPSE BID SCORING ALGORITHM
// Calculates competitive scores for provider bids
// ============================================================

import {
  Bid,
  Intent,
  BidScoreWeights,
  DEFAULT_BID_WEIGHTS
} from '@synapse/types';

export class BidScorer {
  private weights: BidScoreWeights;

  constructor(weights: Partial<BidScoreWeights> = {}) {
    this.weights = { ...DEFAULT_BID_WEIGHTS, ...weights };
  }

  /**
   * Calculate the overall score for a bid
   *
   * Formula:
   * Score = (w1 × PriceScore + w2 × ReputationScore + w3 × SpeedScore) × TEE_Bonus
   *
   * Where:
   * - PriceScore = (MaxBudget - BidPrice) / MaxBudget  (0-1, lower bid = higher score)
   * - ReputationScore = ProviderRep / 5.0             (0-1, higher rep = higher score)
   * - SpeedScore = 1 - (EstTime / MaxLatency)         (0-1, faster = higher score)
   * - TEE_Bonus = 1.2 if TEE attested, else 1.0
   */
  calculateScore(bid: Bid, intent: Intent): number {
    const priceScore = this.calculatePriceScore(bid.bidAmount, intent.maxBudget);
    const reputationScore = this.calculateReputationScore(bid.reputationScore);
    const speedScore = this.calculateSpeedScore(bid.estimatedTime, intent.requirements.maxLatency);
    const teeMultiplier = bid.teeAttested ? this.weights.teeBonus : 1.0;

    // Weighted sum with TEE bonus as multiplier
    const baseScore = (
      this.weights.price * priceScore +
      this.weights.reputation * reputationScore +
      this.weights.speed * speedScore
    );

    const finalScore = baseScore * teeMultiplier;

    // Normalize to 0-100 scale
    return Math.round(finalScore * 100);
  }

  /**
   * Price Score: Lower bid relative to max budget = higher score
   * Range: 0 to 1
   */
  private calculatePriceScore(bidAmount: number, maxBudget: number): number {
    if (maxBudget <= 0) return 0;
    if (bidAmount <= 0) return 1;
    if (bidAmount >= maxBudget) return 0;

    // Linear score: bid at 0 = score 1, bid at maxBudget = score 0
    return (maxBudget - bidAmount) / maxBudget;
  }

  /**
   * Reputation Score: Direct mapping from 0-5 to 0-1
   * Range: 0 to 1
   */
  private calculateReputationScore(reputation: number): number {
    const clampedRep = Math.max(0, Math.min(5, reputation));
    return clampedRep / 5.0;
  }

  /**
   * Speed Score: Faster estimated time = higher score
   * Range: 0 to 1
   */
  private calculateSpeedScore(estimatedTime: number, maxLatency?: number): number {
    // If no max latency requirement, use default of 30 seconds
    const maxTime = maxLatency || 30000;

    if (estimatedTime <= 0) return 1;
    if (estimatedTime >= maxTime) return 0;

    return 1 - (estimatedTime / maxTime);
  }

  /**
   * Calculate detailed breakdown for debugging/display
   */
  getScoreBreakdown(bid: Bid, intent: Intent): {
    priceScore: number;
    reputationScore: number;
    speedScore: number;
    teeBonus: boolean;
    rawScore: number;
    finalScore: number;
  } {
    const priceScore = this.calculatePriceScore(bid.bidAmount, intent.maxBudget);
    const reputationScore = this.calculateReputationScore(bid.reputationScore);
    const speedScore = this.calculateSpeedScore(bid.estimatedTime, intent.requirements.maxLatency);
    const teeBonus = bid.teeAttested;

    const rawScore = (
      this.weights.price * priceScore +
      this.weights.reputation * reputationScore +
      this.weights.speed * speedScore
    );

    const finalScore = rawScore * (teeBonus ? this.weights.teeBonus : 1.0);

    return {
      priceScore: Math.round(priceScore * 100) / 100,
      reputationScore: Math.round(reputationScore * 100) / 100,
      speedScore: Math.round(speedScore * 100) / 100,
      teeBonus,
      rawScore: Math.round(rawScore * 100) / 100,
      finalScore: Math.round(finalScore * 100)
    };
  }

  /**
   * Compare two bids and return the better one
   */
  compareBids(bidA: Bid, bidB: Bid, intent: Intent): Bid {
    const scoreA = this.calculateScore(bidA, intent);
    const scoreB = this.calculateScore(bidB, intent);
    return scoreA >= scoreB ? bidA : bidB;
  }

  /**
   * Rank a list of bids from best to worst
   */
  rankBids(bids: Bid[], intent: Intent): Bid[] {
    return [...bids]
      .map(bid => ({
        bid,
        score: this.calculateScore(bid, intent)
      }))
      .sort((a, b) => b.score - a.score)
      .map(({ bid }, index) => ({
        ...bid,
        calculatedScore: this.calculateScore(bid, intent),
        rank: index + 1
      }));
  }

  /**
   * Update scoring weights
   */
  setWeights(newWeights: Partial<BidScoreWeights>): void {
    this.weights = { ...this.weights, ...newWeights };
  }

  /**
   * Get current weights
   */
  getWeights(): BidScoreWeights {
    return { ...this.weights };
  }
}

/**
 * Utility function to format score for display
 */
export function formatScore(score: number): string {
  return `${score}/100`;
}

/**
 * Utility function to get score color class
 */
export function getScoreColor(score: number): 'green' | 'yellow' | 'red' {
  if (score >= 70) return 'green';
  if (score >= 40) return 'yellow';
  return 'red';
}
