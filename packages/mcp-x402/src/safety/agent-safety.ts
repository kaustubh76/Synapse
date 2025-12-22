// ============================================================
// AGENT SAFETY PROTOCOL - Protect agents from runaway spending
// Multi-layer protection: Rate limits, anomaly detection, circuit breakers
// ============================================================

import { EventEmitter } from 'eventemitter3';

/**
 * Safety configuration
 */
export interface SafetyConfig {
  /** Rate limiting */
  rateLimit: {
    /** Max transactions per minute */
    maxTxPerMinute: number;
    /** Max value per minute (USDC) */
    maxValuePerMinute: string;
    /** Cooldown period after hitting limit (seconds) */
    cooldownPeriod: number;
  };
  /** Anomaly detection */
  anomalyDetection: {
    /** Enable anomaly detection */
    enabled: boolean;
    /** Sensitivity (0-1, higher = more sensitive) */
    sensitivity: number;
    /** Minimum transactions before detecting anomalies */
    minTransactions: number;
    /** Standard deviations for anomaly threshold */
    stdDevThreshold: number;
  };
  /** Circuit breaker */
  circuitBreaker: {
    /** Enable circuit breaker */
    enabled: boolean;
    /** Failure threshold to trip breaker */
    failureThreshold: number;
    /** Time window for failures (seconds) */
    failureWindow: number;
    /** Recovery timeout (seconds) */
    recoveryTimeout: number;
  };
  /** Circular payment detection */
  circularDetection: {
    /** Enable circular payment detection */
    enabled: boolean;
    /** Max hops to check */
    maxHops: number;
    /** Time window for cycle detection (seconds) */
    timeWindow: number;
  };
  /** Large transaction protection */
  largeTransaction: {
    /** Threshold for "large" transactions (USDC) */
    threshold: string;
    /** Require confirmation for large transactions */
    requireConfirmation: boolean;
    /** Delay before execution (seconds) */
    delaySeconds: number;
  };
}

/**
 * Transaction for safety analysis
 */
export interface SafetyTransaction {
  /** Transaction ID */
  id: string;
  /** Timestamp */
  timestamp: number;
  /** Sender address */
  sender: string;
  /** Recipient address */
  recipient: string;
  /** Amount in USDC */
  amount: string;
  /** Resource/tool being paid for */
  resource: string;
  /** Session ID */
  sessionId?: string;
}

/**
 * Safety check result
 */
export interface SafetyCheckResult {
  /** Whether transaction is allowed */
  allowed: boolean;
  /** Reason if not allowed */
  reason?: string;
  /** Warnings (non-blocking) */
  warnings: string[];
  /** Risk score (0-1) */
  riskScore: number;
  /** Recommended actions */
  recommendations: string[];
  /** Requires confirmation */
  requiresConfirmation: boolean;
  /** Delay before execution (ms) */
  delayMs: number;
}

/**
 * Safety events
 */
export interface SafetyEvents {
  /** Transaction blocked */
  'blocked': (tx: SafetyTransaction, reason: string) => void;
  /** Anomaly detected */
  'anomaly': (tx: SafetyTransaction, details: string) => void;
  /** Rate limit hit */
  'rateLimit': (type: 'count' | 'value') => void;
  /** Circuit breaker tripped */
  'circuitBreaker': (state: 'open' | 'half-open' | 'closed') => void;
  /** Circular payment detected */
  'circularPayment': (cycle: string[]) => void;
  /** Large transaction */
  'largeTransaction': (tx: SafetyTransaction) => void;
  /** Cooldown started */
  'cooldownStarted': (durationMs: number) => void;
  /** Cooldown ended */
  'cooldownEnded': () => void;
}

/**
 * Circuit breaker state
 */
type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * AgentSafetyProtocol - Multi-layer protection for autonomous agents
 *
 * Layers:
 * 1. Rate Limiting - Prevent rapid transaction bursts
 * 2. Anomaly Detection - Detect unusual patterns
 * 3. Circuit Breaker - Stop after repeated failures
 * 4. Circular Detection - Prevent payment loops
 * 5. Large Transaction Protection - Extra checks for big payments
 */
export class AgentSafetyProtocol extends EventEmitter<SafetyEvents> {
  private config: SafetyConfig;

  // Rate limiting state
  private recentTransactions: SafetyTransaction[] = [];
  private cooldownUntil: number = 0;

  // Anomaly detection state
  private transactionHistory: SafetyTransaction[] = [];
  private amountStats: { mean: number; stdDev: number } = { mean: 0, stdDev: 0 };

  // Circuit breaker state
  private circuitState: CircuitState = 'closed';
  private failures: number[] = [];
  private lastFailure: number = 0;
  private recoveryAttemptAt: number = 0;

  // Circular detection state
  private transactionGraph: Map<string, Array<{ to: string; timestamp: number }>> = new Map();

  constructor(config?: Partial<SafetyConfig>) {
    super();

    // Default configuration
    this.config = {
      rateLimit: {
        maxTxPerMinute: 10,
        maxValuePerMinute: '1',
        cooldownPeriod: 60,
        ...config?.rateLimit,
      },
      anomalyDetection: {
        enabled: true,
        sensitivity: 0.5,
        minTransactions: 10,
        stdDevThreshold: 2,
        ...config?.anomalyDetection,
      },
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        failureWindow: 300,
        recoveryTimeout: 60,
        ...config?.circuitBreaker,
      },
      circularDetection: {
        enabled: true,
        maxHops: 5,
        timeWindow: 300,
        ...config?.circularDetection,
      },
      largeTransaction: {
        threshold: '10',
        requireConfirmation: true,
        delaySeconds: 5,
        ...config?.largeTransaction,
      },
    };
  }

  /**
   * Check if a transaction should be allowed
   */
  check(tx: SafetyTransaction): SafetyCheckResult {
    const result: SafetyCheckResult = {
      allowed: true,
      warnings: [],
      riskScore: 0,
      recommendations: [],
      requiresConfirmation: false,
      delayMs: 0,
    };

    // Check cooldown
    if (Date.now() < this.cooldownUntil) {
      result.allowed = false;
      result.reason = `In cooldown until ${new Date(this.cooldownUntil).toISOString()}`;
      return result;
    }

    // Check circuit breaker
    const circuitResult = this.checkCircuitBreaker();
    if (!circuitResult.allowed) {
      return { ...result, ...circuitResult };
    }

    // Check rate limits
    const rateResult = this.checkRateLimits(tx);
    if (!rateResult.allowed) {
      return { ...result, ...rateResult };
    }
    if (rateResult.warnings) {
      result.warnings.push(...rateResult.warnings);
    }

    // Check circular payments
    if (this.config.circularDetection.enabled) {
      const circularResult = this.checkCircularPayment(tx);
      if (!circularResult.allowed) {
        return { ...result, ...circularResult };
      }
      if (circularResult.warnings) {
        result.warnings.push(...circularResult.warnings);
      }
    }

    // Check for anomalies
    if (this.config.anomalyDetection.enabled) {
      const anomalyResult = this.checkAnomalies(tx);
      if (anomalyResult.warnings) {
        result.warnings.push(...anomalyResult.warnings);
      }
      result.riskScore = Math.max(result.riskScore, anomalyResult.riskScore ?? 0);
      if (anomalyResult.recommendations) {
        result.recommendations.push(...anomalyResult.recommendations);
      }
    }

    // Check large transaction
    const largeResult = this.checkLargeTransaction(tx);
    if (largeResult.requiresConfirmation) {
      result.requiresConfirmation = true;
      result.delayMs = largeResult.delayMs ?? 0;
      if (largeResult.warnings) {
        result.warnings.push(...largeResult.warnings);
      }
    }

    // Calculate final risk score
    result.riskScore = this.calculateRiskScore(tx, result.warnings.length);

    return result;
  }

  /**
   * Record a completed transaction
   */
  recordTransaction(tx: SafetyTransaction, success: boolean): void {
    // Add to recent transactions
    this.recentTransactions.push(tx);
    this.cleanupRecentTransactions();

    // Add to history for anomaly detection
    this.transactionHistory.push(tx);
    if (this.transactionHistory.length > 1000) {
      this.transactionHistory = this.transactionHistory.slice(-500);
    }
    this.updateAmountStats();

    // Update transaction graph for circular detection
    this.addToTransactionGraph(tx);

    // Update circuit breaker
    if (success) {
      this.recordSuccess();
    } else {
      this.recordFailure();
    }
  }

  /**
   * Record a transaction failure
   */
  recordFailure(): void {
    const now = Date.now();
    this.failures.push(now);
    this.lastFailure = now;

    // Cleanup old failures
    const windowStart = now - this.config.circuitBreaker.failureWindow * 1000;
    this.failures = this.failures.filter(f => f > windowStart);

    // Check if we should trip the circuit
    if (this.failures.length >= this.config.circuitBreaker.failureThreshold) {
      this.tripCircuit();
    }
  }

  /**
   * Record a transaction success
   */
  recordSuccess(): void {
    if (this.circuitState === 'half-open') {
      this.closeCircuit();
    }
  }

  /**
   * Get current safety status
   */
  getStatus(): {
    circuitState: CircuitState;
    inCooldown: boolean;
    cooldownRemaining: number;
    recentTxCount: number;
    recentTxValue: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  } {
    this.cleanupRecentTransactions();

    const now = Date.now();
    const inCooldown = now < this.cooldownUntil;
    const cooldownRemaining = inCooldown ? this.cooldownUntil - now : 0;

    const recentValue = this.recentTransactions.reduce(
      (sum, tx) => sum + parseFloat(tx.amount),
      0
    );

    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (this.circuitState === 'open') {
      riskLevel = 'critical';
    } else if (inCooldown) {
      riskLevel = 'high';
    } else if (this.recentTransactions.length > this.config.rateLimit.maxTxPerMinute * 0.8) {
      riskLevel = 'medium';
    }

    return {
      circuitState: this.circuitState,
      inCooldown,
      cooldownRemaining,
      recentTxCount: this.recentTransactions.length,
      recentTxValue: recentValue.toFixed(6),
      riskLevel,
    };
  }

  /**
   * Reset safety state (for testing or recovery)
   */
  reset(): void {
    this.recentTransactions = [];
    this.cooldownUntil = 0;
    this.circuitState = 'closed';
    this.failures = [];
    this.transactionGraph.clear();
  }

  /**
   * Force close the circuit breaker
   */
  forceCloseCircuit(): void {
    this.circuitState = 'closed';
    this.failures = [];
    this.emit('circuitBreaker', 'closed');
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  private checkCircuitBreaker(): Partial<SafetyCheckResult> {
    if (!this.config.circuitBreaker.enabled) {
      return { allowed: true, warnings: [] };
    }

    const now = Date.now();

    switch (this.circuitState) {
      case 'open':
        // Check if we should try recovery
        if (now > this.recoveryAttemptAt) {
          this.circuitState = 'half-open';
          this.emit('circuitBreaker', 'half-open');
          return { allowed: true, warnings: ['Circuit breaker in half-open state - testing recovery'] };
        }
        return {
          allowed: false,
          reason: `Circuit breaker open. Recovery attempt at ${new Date(this.recoveryAttemptAt).toISOString()}`,
        };

      case 'half-open':
        return { allowed: true, warnings: ['Circuit breaker in recovery mode'] };

      case 'closed':
      default:
        return { allowed: true, warnings: [] };
    }
  }

  private checkRateLimits(tx: SafetyTransaction): Partial<SafetyCheckResult> {
    this.cleanupRecentTransactions();

    const warnings: string[] = [];

    // Check transaction count
    if (this.recentTransactions.length >= this.config.rateLimit.maxTxPerMinute) {
      this.startCooldown();
      this.emit('rateLimit', 'count');
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${this.config.rateLimit.maxTxPerMinute} transactions per minute`,
      };
    }

    // Check transaction value
    const recentValue = this.recentTransactions.reduce(
      (sum, t) => sum + parseFloat(t.amount),
      0
    );
    const newValue = recentValue + parseFloat(tx.amount);
    const maxValue = parseFloat(this.config.rateLimit.maxValuePerMinute);

    if (newValue > maxValue) {
      this.startCooldown();
      this.emit('rateLimit', 'value');
      return {
        allowed: false,
        reason: `Value limit exceeded: ${maxValue} USDC per minute`,
      };
    }

    // Warnings for approaching limits
    if (this.recentTransactions.length > this.config.rateLimit.maxTxPerMinute * 0.8) {
      warnings.push('Approaching transaction rate limit');
    }
    if (newValue > maxValue * 0.8) {
      warnings.push('Approaching value rate limit');
    }

    return { allowed: true, warnings };
  }

  private checkCircularPayment(tx: SafetyTransaction): Partial<SafetyCheckResult> {
    const warnings: string[] = [];

    // Check for cycles in recent transactions
    const cycle = this.detectCycle(tx.sender, tx.recipient);

    if (cycle) {
      this.emit('circularPayment', cycle);
      return {
        allowed: false,
        reason: `Circular payment detected: ${cycle.join(' -> ')}`,
      };
    }

    // Check for potential cycle formation
    const potentialCycle = this.detectPotentialCycle(tx.sender, tx.recipient);
    if (potentialCycle) {
      warnings.push(`Potential circular pattern forming with ${tx.recipient}`);
    }

    return { allowed: true, warnings };
  }

  private checkAnomalies(tx: SafetyTransaction): Partial<SafetyCheckResult> {
    const warnings: string[] = [];
    const recommendations: string[] = [];
    let riskScore = 0;

    // Need minimum history for anomaly detection
    if (this.transactionHistory.length < this.config.anomalyDetection.minTransactions) {
      return { allowed: true, warnings: [], riskScore: 0, recommendations: [] };
    }

    const amount = parseFloat(tx.amount);

    // Check amount anomaly
    if (this.amountStats.stdDev > 0) {
      const zScore = Math.abs(amount - this.amountStats.mean) / this.amountStats.stdDev;
      if (zScore > this.config.anomalyDetection.stdDevThreshold) {
        const anomalyMsg = `Unusual amount: ${tx.amount} USDC (${zScore.toFixed(1)} std devs from mean)`;
        warnings.push(anomalyMsg);
        this.emit('anomaly', tx, anomalyMsg);
        riskScore += 0.3;
        recommendations.push('Review transaction before proceeding');
      }
    }

    // Check time anomaly (unusual hour)
    const hour = new Date(tx.timestamp).getHours();
    if (hour >= 2 && hour <= 5) {
      warnings.push(`Transaction at unusual hour (${hour}:00)`);
      riskScore += 0.1;
    }

    // Check rapid transactions to same recipient
    const recentToSame = this.recentTransactions.filter(
      t => t.recipient === tx.recipient
    ).length;
    if (recentToSame >= 3) {
      warnings.push(`${recentToSame} recent transactions to same recipient`);
      riskScore += 0.2;
    }

    // Check for new recipient
    const knownRecipient = this.transactionHistory.some(
      t => t.recipient === tx.recipient
    );
    if (!knownRecipient) {
      warnings.push('First transaction to this recipient');
      riskScore += 0.1;
    }

    return { allowed: true, warnings, riskScore, recommendations };
  }

  private checkLargeTransaction(tx: SafetyTransaction): Partial<SafetyCheckResult> {
    const warnings: string[] = [];
    const amount = parseFloat(tx.amount);
    const threshold = parseFloat(this.config.largeTransaction.threshold);

    if (amount >= threshold) {
      this.emit('largeTransaction', tx);
      warnings.push(`Large transaction: ${tx.amount} USDC (threshold: ${threshold})`);

      return {
        requiresConfirmation: this.config.largeTransaction.requireConfirmation,
        delayMs: this.config.largeTransaction.delaySeconds * 1000,
        warnings,
      };
    }

    return { requiresConfirmation: false, delayMs: 0, warnings: [] };
  }

  private calculateRiskScore(tx: SafetyTransaction, warningCount: number): number {
    let score = 0;

    // Base score from warnings
    score += warningCount * 0.1;

    // Amount factor
    const amount = parseFloat(tx.amount);
    const threshold = parseFloat(this.config.largeTransaction.threshold);
    score += (amount / threshold) * 0.2;

    // Circuit state factor
    if (this.circuitState === 'half-open') score += 0.2;
    if (this.circuitState === 'open') score += 0.5;

    // Recent activity factor
    const recentCount = this.recentTransactions.length;
    const maxCount = this.config.rateLimit.maxTxPerMinute;
    score += (recentCount / maxCount) * 0.2;

    return Math.min(1, score);
  }

  private cleanupRecentTransactions(): void {
    const oneMinuteAgo = Date.now() - 60_000;
    this.recentTransactions = this.recentTransactions.filter(
      tx => tx.timestamp > oneMinuteAgo
    );
  }

  private startCooldown(): void {
    this.cooldownUntil = Date.now() + this.config.rateLimit.cooldownPeriod * 1000;
    this.emit('cooldownStarted', this.config.rateLimit.cooldownPeriod * 1000);

    // Schedule cooldown end notification
    setTimeout(() => {
      if (Date.now() >= this.cooldownUntil) {
        this.emit('cooldownEnded');
      }
    }, this.config.rateLimit.cooldownPeriod * 1000);
  }

  private tripCircuit(): void {
    this.circuitState = 'open';
    this.recoveryAttemptAt = Date.now() + this.config.circuitBreaker.recoveryTimeout * 1000;
    this.emit('circuitBreaker', 'open');
  }

  private closeCircuit(): void {
    this.circuitState = 'closed';
    this.failures = [];
    this.emit('circuitBreaker', 'closed');
  }

  private updateAmountStats(): void {
    const amounts = this.transactionHistory.map(tx => parseFloat(tx.amount));
    if (amounts.length === 0) return;

    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    this.amountStats = { mean, stdDev };
  }

  private addToTransactionGraph(tx: SafetyTransaction): void {
    if (!this.transactionGraph.has(tx.sender)) {
      this.transactionGraph.set(tx.sender, []);
    }
    this.transactionGraph.get(tx.sender)!.push({
      to: tx.recipient,
      timestamp: tx.timestamp,
    });

    // Cleanup old entries
    const cutoff = Date.now() - this.config.circularDetection.timeWindow * 1000;
    for (const [sender, edges] of this.transactionGraph) {
      const filtered = edges.filter(e => e.timestamp > cutoff);
      if (filtered.length === 0) {
        this.transactionGraph.delete(sender);
      } else {
        this.transactionGraph.set(sender, filtered);
      }
    }
  }

  private detectCycle(from: string, to: string): string[] | null {
    // BFS to find if there's a path from 'to' back to 'from'
    const visited = new Set<string>();
    const queue: Array<{ node: string; path: string[] }> = [{ node: to, path: [from, to] }];

    while (queue.length > 0) {
      const { node, path } = queue.shift()!;

      if (path.length > this.config.circularDetection.maxHops + 1) {
        continue;
      }

      const edges = this.transactionGraph.get(node) || [];
      for (const edge of edges) {
        if (edge.to === from) {
          return [...path, from]; // Cycle found
        }

        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          queue.push({ node: edge.to, path: [...path, edge.to] });
        }
      }
    }

    return null;
  }

  private detectPotentialCycle(from: string, to: string): boolean {
    // Check if 'to' has ever sent to 'from' (potential for cycle)
    const edges = this.transactionGraph.get(to) || [];
    return edges.some(e => e.to === from);
  }
}

/**
 * Default safety configuration
 */
export const DEFAULT_SAFETY_CONFIG: SafetyConfig = {
  rateLimit: {
    maxTxPerMinute: 10,
    maxValuePerMinute: '1',
    cooldownPeriod: 60,
  },
  anomalyDetection: {
    enabled: true,
    sensitivity: 0.5,
    minTransactions: 10,
    stdDevThreshold: 2,
  },
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    failureWindow: 300,
    recoveryTimeout: 60,
  },
  circularDetection: {
    enabled: true,
    maxHops: 5,
    timeWindow: 300,
  },
  largeTransaction: {
    threshold: '10',
    requireConfirmation: true,
    delaySeconds: 5,
  },
};
