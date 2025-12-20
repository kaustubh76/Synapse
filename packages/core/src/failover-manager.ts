// ============================================================
// SYNAPSE Failover Manager
// Advanced failover handling with provider health tracking
// ============================================================

import { EventEmitter } from 'eventemitter3';

export interface ProviderHealth {
  address: string;
  successCount: number;
  failureCount: number;
  totalLatency: number;
  lastSuccess: number;
  lastFailure: number;
  currentStreak: 'success' | 'failure';
  streakCount: number;
  healthScore: number; // 0-100
  circuitBreakerOpen: boolean;
  circuitBreakerResetAt?: number;
}

export interface FailoverEvent {
  intentId: string;
  failedProvider: string;
  newProvider: string | null;
  reason: 'timeout' | 'error' | 'rejection';
  timestamp: number;
}

interface FailoverManagerEvents {
  'provider:healthy': (address: string, health: ProviderHealth) => void;
  'provider:unhealthy': (address: string, health: ProviderHealth) => void;
  'circuit:opened': (address: string) => void;
  'circuit:closed': (address: string) => void;
  'failover:recorded': (event: FailoverEvent) => void;
}

const DEFAULT_CONFIG = {
  // Circuit breaker settings
  circuitBreakerThreshold: 3,    // Failures before opening circuit
  circuitBreakerResetMs: 30000,  // Time before trying again
  // Health scoring
  healthDecayRate: 0.95,         // Decay rate for health score
  successWeight: 10,             // Points for success
  failureWeight: -25,            // Points for failure
  latencyWeight: 0.5,            // Weight for latency (lower is better)
  // Thresholds
  unhealthyThreshold: 30,        // Below this = unhealthy
  healthyThreshold: 70           // Above this = healthy
};

/**
 * Failover Manager
 *
 * Tracks provider health and manages circuit breakers for automatic failover.
 */
export class FailoverManager extends EventEmitter<FailoverManagerEvents> {
  private providerHealth: Map<string, ProviderHealth> = new Map();
  private failoverHistory: FailoverEvent[] = [];
  private config: typeof DEFAULT_CONFIG;

  constructor(config: Partial<typeof DEFAULT_CONFIG> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record a successful execution
   */
  recordSuccess(providerAddress: string, latencyMs: number): void {
    const health = this.getOrCreateHealth(providerAddress);

    health.successCount++;
    health.totalLatency += latencyMs;
    health.lastSuccess = Date.now();

    if (health.currentStreak === 'success') {
      health.streakCount++;
    } else {
      health.currentStreak = 'success';
      health.streakCount = 1;
    }

    // Update health score
    this.updateHealthScore(health, true, latencyMs);

    // Check if circuit breaker should close
    if (health.circuitBreakerOpen && health.streakCount >= 2) {
      health.circuitBreakerOpen = false;
      health.circuitBreakerResetAt = undefined;
      this.emit('circuit:closed', providerAddress);
    }

    if (health.healthScore >= this.config.healthyThreshold) {
      this.emit('provider:healthy', providerAddress, health);
    }
  }

  /**
   * Record a failed execution
   */
  recordFailure(providerAddress: string, reason: string): void {
    const health = this.getOrCreateHealth(providerAddress);

    health.failureCount++;
    health.lastFailure = Date.now();

    if (health.currentStreak === 'failure') {
      health.streakCount++;
    } else {
      health.currentStreak = 'failure';
      health.streakCount = 1;
    }

    // Update health score
    this.updateHealthScore(health, false, 0);

    // Check if circuit breaker should open
    if (health.streakCount >= this.config.circuitBreakerThreshold) {
      health.circuitBreakerOpen = true;
      health.circuitBreakerResetAt = Date.now() + this.config.circuitBreakerResetMs;
      this.emit('circuit:opened', providerAddress);
    }

    if (health.healthScore < this.config.unhealthyThreshold) {
      this.emit('provider:unhealthy', providerAddress, health);
    }
  }

  /**
   * Record a failover event
   */
  recordFailover(event: Omit<FailoverEvent, 'timestamp'>): void {
    const fullEvent: FailoverEvent = {
      ...event,
      timestamp: Date.now()
    };

    this.failoverHistory.push(fullEvent);

    // Keep only last 1000 events
    if (this.failoverHistory.length > 1000) {
      this.failoverHistory = this.failoverHistory.slice(-1000);
    }

    // Record failure for the failed provider
    this.recordFailure(event.failedProvider, event.reason);

    this.emit('failover:recorded', fullEvent);
  }

  /**
   * Check if a provider is available (not circuit-broken)
   */
  isProviderAvailable(providerAddress: string): boolean {
    const health = this.providerHealth.get(providerAddress);
    if (!health) return true; // Unknown providers are assumed available

    if (!health.circuitBreakerOpen) return true;

    // Check if reset time has passed
    if (health.circuitBreakerResetAt && Date.now() > health.circuitBreakerResetAt) {
      // Half-open state - allow one request
      return true;
    }

    return false;
  }

  /**
   * Get best available provider from a list
   */
  selectBestProvider(providers: string[]): string | null {
    const available = providers.filter(p => this.isProviderAvailable(p));

    if (available.length === 0) return null;

    // Sort by health score descending
    available.sort((a, b) => {
      const healthA = this.providerHealth.get(a);
      const healthB = this.providerHealth.get(b);

      const scoreA = healthA?.healthScore ?? 50;
      const scoreB = healthB?.healthScore ?? 50;

      return scoreB - scoreA;
    });

    return available[0];
  }

  /**
   * Get provider health info
   */
  getHealth(providerAddress: string): ProviderHealth | undefined {
    return this.providerHealth.get(providerAddress);
  }

  /**
   * Get all provider health info
   */
  getAllHealth(): ProviderHealth[] {
    return Array.from(this.providerHealth.values());
  }

  /**
   * Get recent failover events
   */
  getFailoverHistory(limit = 50): FailoverEvent[] {
    return this.failoverHistory.slice(-limit);
  }

  /**
   * Get failover stats
   */
  getStats(): {
    totalProviders: number;
    healthyProviders: number;
    unhealthyProviders: number;
    circuitBrokenProviders: number;
    totalFailovers: number;
    recentFailovers: number;
  } {
    const providers = this.getAllHealth();
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    return {
      totalProviders: providers.length,
      healthyProviders: providers.filter(p => p.healthScore >= this.config.healthyThreshold).length,
      unhealthyProviders: providers.filter(p => p.healthScore < this.config.unhealthyThreshold).length,
      circuitBrokenProviders: providers.filter(p => p.circuitBreakerOpen).length,
      totalFailovers: this.failoverHistory.length,
      recentFailovers: this.failoverHistory.filter(e => e.timestamp > oneHourAgo).length
    };
  }

  /**
   * Reset health for a provider
   */
  resetHealth(providerAddress: string): void {
    this.providerHealth.delete(providerAddress);
  }

  /**
   * Clear all health data
   */
  clear(): void {
    this.providerHealth.clear();
    this.failoverHistory = [];
  }

  // -------------------- Private Methods --------------------

  private getOrCreateHealth(address: string): ProviderHealth {
    let health = this.providerHealth.get(address);

    if (!health) {
      health = {
        address,
        successCount: 0,
        failureCount: 0,
        totalLatency: 0,
        lastSuccess: 0,
        lastFailure: 0,
        currentStreak: 'success',
        streakCount: 0,
        healthScore: 50, // Start at neutral
        circuitBreakerOpen: false
      };
      this.providerHealth.set(address, health);
    }

    return health;
  }

  private updateHealthScore(
    health: ProviderHealth,
    success: boolean,
    latencyMs: number
  ): void {
    // Decay existing score slightly
    health.healthScore *= this.config.healthDecayRate;

    if (success) {
      // Add success points
      health.healthScore += this.config.successWeight;

      // Bonus for fast execution
      const avgLatency = health.totalLatency / health.successCount;
      if (latencyMs < avgLatency) {
        health.healthScore += 2;
      }
    } else {
      // Subtract failure points
      health.healthScore += this.config.failureWeight;
    }

    // Clamp to 0-100
    health.healthScore = Math.max(0, Math.min(100, health.healthScore));
  }
}

// Singleton instance
let failoverManagerInstance: FailoverManager | null = null;

export function getFailoverManager(): FailoverManager {
  if (!failoverManagerInstance) {
    failoverManagerInstance = new FailoverManager();
  }
  return failoverManagerInstance;
}

export function resetFailoverManager(): void {
  failoverManagerInstance = null;
}
