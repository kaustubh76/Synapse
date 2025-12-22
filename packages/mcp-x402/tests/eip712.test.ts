// ============================================================
// EIP-712 TESTS
// Unit tests for EIP-712 signing utilities
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  createX402Domain,
  createTypedData,
  createTypedDataHash,
  validatePaymentData,
  createNonce,
  toRawUSDCAmount,
  fromRawUSDCAmount,
  EIP712_CHAIN_IDS,
  X402PaymentType,
} from '../src/crypto/index.js';

describe('EIP-712', () => {
  describe('createX402Domain', () => {
    it('should create domain for base-sepolia', () => {
      const domain = createX402Domain('base-sepolia');

      expect(domain.name).toBe('x402 Payment Protocol');
      expect(domain.version).toBe('1');
      expect(domain.chainId).toBe(EIP712_CHAIN_IDS['base-sepolia']);
      expect(domain.verifyingContract).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should create domain for base mainnet', () => {
      const domain = createX402Domain('base');

      expect(domain.chainId).toBe(EIP712_CHAIN_IDS['base']);
    });
  });

  describe('createTypedData', () => {
    it('should create valid typed data structure', () => {
      const payment: X402PaymentType = {
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '1000000',
        tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        nonce: '0x' + '0'.repeat(64),
        expiry: Math.floor(Date.now() / 1000) + 300,
        resource: 'test-tool',
        network: 'base-sepolia',
      };

      const typedData = createTypedData('base-sepolia', payment);

      expect(typedData.domain).toBeDefined();
      expect(typedData.types).toBeDefined();
      expect(typedData.primaryType).toBe('Payment');
      expect(typedData.message).toEqual(payment);
    });

    it('should include EIP712Domain type', () => {
      const typedData = createTypedData('base-sepolia', {
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '1000000',
        tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        nonce: '0x' + '0'.repeat(64),
        expiry: Math.floor(Date.now() / 1000) + 300,
        resource: 'test-tool',
        network: 'base-sepolia',
      });

      expect(typedData.types.EIP712Domain).toBeDefined();
      expect(typedData.types.Payment).toBeDefined();
    });
  });

  describe('createTypedDataHash', () => {
    it('should create consistent hashes', () => {
      const domain = createX402Domain('base-sepolia');
      const payment: X402PaymentType = {
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '1000000',
        tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        nonce: '0x' + '0'.repeat(64),
        expiry: 1700000000,
        resource: 'test-tool',
        network: 'base-sepolia',
      };

      const hash1 = createTypedDataHash(domain, payment);
      const hash2 = createTypedDataHash(domain, payment);

      expect(hash1.digest).toBe(hash2.digest);
      expect(hash1.domainSeparator).toBe(hash2.domainSeparator);
      expect(hash1.structHash).toBe(hash2.structHash);
    });

    it('should produce different hashes for different payments', () => {
      const domain = createX402Domain('base-sepolia');
      const payment1: X402PaymentType = {
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '1000000',
        tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        nonce: '0x' + '0'.repeat(64),
        expiry: 1700000000,
        resource: 'tool-1',
        network: 'base-sepolia',
      };
      const payment2: X402PaymentType = {
        ...payment1,
        amount: '2000000',
      };

      const hash1 = createTypedDataHash(domain, payment1);
      const hash2 = createTypedDataHash(domain, payment2);

      expect(hash1.digest).not.toBe(hash2.digest);
    });

    it('should return hex-encoded hashes', () => {
      const domain = createX402Domain('base-sepolia');
      const payment: X402PaymentType = {
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '1000000',
        tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        nonce: '0x' + '0'.repeat(64),
        expiry: 1700000000,
        resource: 'test-tool',
        network: 'base-sepolia',
      };

      const hash = createTypedDataHash(domain, payment);

      expect(hash.digest).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(hash.domainSeparator).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(hash.structHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });

  describe('validatePaymentData', () => {
    const validPayment: X402PaymentType = {
      recipient: '0x1234567890123456789012345678901234567890',
      amount: '1000000',
      tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      nonce: '0x' + '0'.repeat(64),
      expiry: Math.floor(Date.now() / 1000) + 300,
      resource: 'test-tool',
      network: 'base-sepolia',
    };

    it('should validate correct payment data', () => {
      const result = validatePaymentData(validPayment);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid recipient address', () => {
      const result = validatePaymentData({
        ...validPayment,
        recipient: 'invalid-address',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('recipient');
    });

    it('should reject invalid token address', () => {
      const result = validatePaymentData({
        ...validPayment,
        tokenAddress: '0x123', // Too short
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('token');
    });

    it('should reject invalid nonce', () => {
      const result = validatePaymentData({
        ...validPayment,
        nonce: '0x123', // Too short
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('nonce');
    });

    it('should reject expired payment', () => {
      const result = validatePaymentData({
        ...validPayment,
        expiry: Math.floor(Date.now() / 1000) - 100, // In the past
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should reject invalid network', () => {
      const result = validatePaymentData({
        ...validPayment,
        network: 'ethereum' as 'base',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('network');
    });

    it('should reject zero amount', () => {
      const result = validatePaymentData({
        ...validPayment,
        amount: '0',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Amount');
    });

    it('should reject negative amount', () => {
      const result = validatePaymentData({
        ...validPayment,
        amount: '-100',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Amount');
    });
  });

  describe('createNonce', () => {
    it('should create valid 32-byte nonce', () => {
      const nonce = createNonce();

      expect(nonce).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should create unique nonces', () => {
      const nonces = new Set<string>();

      for (let i = 0; i < 100; i++) {
        nonces.add(createNonce());
      }

      expect(nonces.size).toBe(100);
    });
  });

  describe('USDC amount conversion', () => {
    describe('toRawUSDCAmount', () => {
      it('should convert decimal to raw', () => {
        expect(toRawUSDCAmount('1.00')).toBe('1000000');
        expect(toRawUSDCAmount('0.50')).toBe('500000');
        expect(toRawUSDCAmount('0.001')).toBe('1000');
        expect(toRawUSDCAmount('100.123456')).toBe('100123456');
      });

      it('should handle number input', () => {
        expect(toRawUSDCAmount(1.5)).toBe('1500000');
        expect(toRawUSDCAmount(0.01)).toBe('10000');
      });

      it('should truncate extra decimals', () => {
        expect(toRawUSDCAmount('1.1234567')).toBe('1123456');
      });
    });

    describe('fromRawUSDCAmount', () => {
      it('should convert raw to decimal', () => {
        expect(fromRawUSDCAmount('1000000')).toBe('1.000000');
        expect(fromRawUSDCAmount('500000')).toBe('0.500000');
        expect(fromRawUSDCAmount('1000')).toBe('0.001000');
      });

      it('should handle zero', () => {
        expect(fromRawUSDCAmount('0')).toBe('0.000000');
      });

      it('should handle large amounts', () => {
        expect(fromRawUSDCAmount('1000000000000')).toBe('1000000.000000');
      });
    });

    it('should round-trip correctly', () => {
      const original = '123.456789';
      const raw = toRawUSDCAmount(original);
      const back = fromRawUSDCAmount(raw);

      // Note: We lose the last decimal due to USDC's 6 decimals
      expect(back).toBe('123.456789');
    });
  });
});
