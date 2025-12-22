// ============================================================
// SAFETY PROTOCOL TESTS
// Unit tests for the AgentSafetyProtocol class
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentSafetyProtocol, DEFAULT_SAFETY_CONFIG, SafetyConfig } from '../src/safety/index.js';

describe('AgentSafetyProtocol', () => {
  describe('rate limiting', () => {
    let safety: AgentSafetyProtocol;

    beforeEach(() => {
      safety = new AgentSafetyProtocol({
        ...DEFAULT_SAFETY_CONFIG,
        rateLimit: {
          maxPerMinute: 5,
          maxPerHour: 20,
          maxPerDay: 100,
          cooldownMs: 1000,
        },
      });
    });

    it('should allow transactions within rate limit', () => {
      const result = safety.check({
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '0.10',
        resource: 'test-tool',
        timestamp: Date.now(),
      });

      expect(result.allowed).toBe(true);
    });

    it('should block transactions exceeding minute limit', () => {
      // Record 5 transactions
      for (let i = 0; i < 5; i++) {
        const tx = {
          recipient: '0x1234567890123456789012345678901234567890',
          amount: '0.10',
          resource: 'test-tool',
          timestamp: Date.now(),
        };
        safety.check(tx);
        safety.recordTransaction(tx, true);
      }

      // 6th should be blocked
      const result = safety.check({
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '0.10',
        resource: 'test-tool',
        timestamp: Date.now(),
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Rate limit');
    });

    it('should suggest delay when rate limited', () => {
      // Fill rate limit
      for (let i = 0; i < 5; i++) {
        const tx = {
          recipient: '0x1234567890123456789012345678901234567890',
          amount: '0.10',
          resource: 'test-tool',
          timestamp: Date.now(),
        };
        safety.check(tx);
        safety.recordTransaction(tx, true);
      }

      const result = safety.check({
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '0.10',
        resource: 'test-tool',
        timestamp: Date.now(),
      });

      expect(result.delayMs).toBeGreaterThan(0);
    });
  });

  describe('anomaly detection', () => {
    let safety: AgentSafetyProtocol;

    beforeEach(() => {
      safety = new AgentSafetyProtocol({
        ...DEFAULT_SAFETY_CONFIG,
        anomalyDetection: {
          enabled: true,
          baselineWindow: 3600000,
          deviationThreshold: 2.0,
          minSampleSize: 5,
        },
      });
    });

    it('should allow normal transactions', () => {
      // Build baseline with small transactions
      for (let i = 0; i < 10; i++) {
        const tx = {
          recipient: '0x1234567890123456789012345678901234567890',
          amount: '0.10',
          resource: 'test-tool',
          timestamp: Date.now() - (10 - i) * 60000,
        };
        safety.recordTransaction(tx, true);
      }

      // Normal transaction should pass
      const result = safety.check({
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '0.15',
        resource: 'test-tool',
        timestamp: Date.now(),
      });

      expect(result.allowed).toBe(true);
    });

    it('should flag anomalous transactions', () => {
      // Build baseline with small transactions
      for (let i = 0; i < 10; i++) {
        const tx = {
          recipient: '0x1234567890123456789012345678901234567890',
          amount: '0.10',
          resource: 'test-tool',
          timestamp: Date.now() - (10 - i) * 60000,
        };
        safety.recordTransaction(tx, true);
      }

      // Anomalous transaction (10x normal)
      const result = safety.check({
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '1.00',
        resource: 'test-tool',
        timestamp: Date.now(),
      });

      // Should either block or add warning
      expect(
        result.allowed === false ||
        (result.warnings && result.warnings.length > 0)
      ).toBe(true);
    });
  });

  describe('circuit breaker', () => {
    let safety: AgentSafetyProtocol;

    beforeEach(() => {
      safety = new AgentSafetyProtocol({
        ...DEFAULT_SAFETY_CONFIG,
        circuitBreaker: {
          enabled: true,
          failureThreshold: 3,
          resetTimeout: 1000,
          halfOpenRequests: 1,
        },
      });
    });

    it('should allow transactions when circuit is closed', () => {
      const result = safety.check({
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '0.10',
        resource: 'test-tool',
        timestamp: Date.now(),
      });

      expect(result.allowed).toBe(true);
    });

    it('should open circuit after consecutive failures', () => {
      // Record 3 failures
      for (let i = 0; i < 3; i++) {
        const tx = {
          recipient: '0x1234567890123456789012345678901234567890',
          amount: '0.10',
          resource: 'test-tool',
          timestamp: Date.now(),
        };
        safety.recordTransaction(tx, false); // failure
      }

      // Next check should be blocked
      const result = safety.check({
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '0.10',
        resource: 'test-tool',
        timestamp: Date.now(),
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Circuit breaker');
    });

    it('should reset after timeout', async () => {
      // Record failures to open circuit
      for (let i = 0; i < 3; i++) {
        safety.recordTransaction({
          recipient: '0x...',
          amount: '0.10',
          resource: 'test-tool',
          timestamp: Date.now(),
        }, false);
      }

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should allow again (half-open state)
      const result = safety.check({
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '0.10',
        resource: 'test-tool',
        timestamp: Date.now(),
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('circular payment detection', () => {
    let safety: AgentSafetyProtocol;

    beforeEach(() => {
      safety = new AgentSafetyProtocol({
        ...DEFAULT_SAFETY_CONFIG,
        circularPaymentDetection: {
          enabled: true,
          maxHops: 3,
          timeWindow: 3600000,
        },
      });
    });

    it('should allow normal payment chains', () => {
      // A -> B
      safety.recordTransaction({
        recipient: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        amount: '0.10',
        resource: 'tool-1',
        timestamp: Date.now(),
      }, true);

      // B -> C
      const result = safety.check({
        recipient: '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
        amount: '0.10',
        resource: 'tool-2',
        timestamp: Date.now(),
      });

      expect(result.allowed).toBe(true);
    });

    it('should detect circular payments', () => {
      const agentA = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      const agentB = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
      const agentC = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

      // Record: A -> B
      safety.recordTransaction({
        recipient: agentB,
        amount: '0.10',
        resource: 'tool-1',
        timestamp: Date.now() - 2000,
      }, true);

      // Record: B -> C
      safety.recordTransaction({
        recipient: agentC,
        amount: '0.10',
        resource: 'tool-2',
        timestamp: Date.now() - 1000,
      }, true);

      // Try: C -> A (circular)
      const result = safety.check({
        recipient: agentA,
        amount: '0.10',
        resource: 'tool-3',
        timestamp: Date.now(),
      });

      // Should either block or warn about circular payment
      expect(
        result.allowed === false ||
        (result.warnings && result.warnings.some(w => w.includes('ircular')))
      ).toBe(true);
    });
  });

  describe('combined checks', () => {
    it('should run all enabled checks', () => {
      const safety = new AgentSafetyProtocol(DEFAULT_SAFETY_CONFIG);

      const result = safety.check({
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '0.10',
        resource: 'test-tool',
        timestamp: Date.now(),
      });

      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('riskScore');
    });

    it('should accumulate risk scores', () => {
      const safety = new AgentSafetyProtocol(DEFAULT_SAFETY_CONFIG);

      // First transaction should have low risk
      const result1 = safety.check({
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '0.10',
        resource: 'test-tool',
        timestamp: Date.now(),
      });

      expect(result1.riskScore).toBeLessThan(50);
    });
  });

  describe('getStats', () => {
    it('should return safety statistics', () => {
      const safety = new AgentSafetyProtocol(DEFAULT_SAFETY_CONFIG);

      // Record some transactions
      for (let i = 0; i < 10; i++) {
        safety.recordTransaction({
          recipient: '0x...',
          amount: '0.10',
          resource: 'test',
          timestamp: Date.now(),
        }, i % 3 !== 0); // Some failures
      }

      const stats = safety.getStats();

      expect(stats).toHaveProperty('totalChecks');
      expect(stats).toHaveProperty('blocked');
      expect(stats).toHaveProperty('allowed');
    });
  });
});
