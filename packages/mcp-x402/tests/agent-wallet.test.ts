// ============================================================
// AGENT WALLET TESTS
// Unit tests for the AgentWallet class
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentWallet, createAgentWallet } from '../src/agent/index.js';

describe('AgentWallet', () => {
  describe('create', () => {
    it('should create a wallet with default constraints', async () => {
      const wallet = await createAgentWallet('base-sepolia');

      expect(wallet).toBeDefined();
      expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(wallet.balance.total).toBe('0');
      expect(wallet.balance.available).toBe('0');
      expect(wallet.balance.locked).toBe('0');
    });

    it('should create a wallet with custom constraints', async () => {
      const wallet = await AgentWallet.create({
        network: 'base-sepolia',
        constraints: {
          maxPerTransaction: '5.00',
          dailyLimit: '50.00',
          requireApprovalAbove: '2.00',
        },
      });

      expect(wallet).toBeDefined();
      expect(wallet.address).toBeDefined();
    });

    it('should generate unique addresses', async () => {
      const wallet1 = await createAgentWallet('base-sepolia');
      const wallet2 = await createAgentWallet('base-sepolia');

      expect(wallet1.address).not.toBe(wallet2.address);
    });
  });

  describe('canPay', () => {
    let wallet: AgentWallet;

    beforeEach(async () => {
      wallet = await AgentWallet.create({
        network: 'base-sepolia',
        constraints: {
          maxPerTransaction: '1.00',
          dailyLimit: '10.00',
          requireApprovalAbove: '0.50',
        },
      });
      // Fund the wallet
      wallet.updateBalance('10000000', '0'); // $10 USDC
    });

    it('should allow payments within limits', () => {
      const result = wallet.canPay('0.25', '0x1234567890123456789012345678901234567890');

      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(false);
    });

    it('should require approval for large payments', () => {
      const result = wallet.canPay('0.75', '0x1234567890123456789012345678901234567890');

      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(true);
    });

    it('should reject payments exceeding max per transaction', () => {
      const result = wallet.canPay('1.50', '0x1234567890123456789012345678901234567890');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('exceeds maximum');
    });

    it('should reject payments with insufficient balance', async () => {
      const poorWallet = await AgentWallet.create({
        network: 'base-sepolia',
        constraints: {
          maxPerTransaction: '100.00',
          dailyLimit: '1000.00',
        },
      });
      poorWallet.updateBalance('100000', '0'); // $0.10 USDC

      const result = poorWallet.canPay('1.00', '0x1234567890123456789012345678901234567890');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Insufficient');
    });
  });

  describe('signPayment', () => {
    let wallet: AgentWallet;

    beforeEach(async () => {
      wallet = await AgentWallet.create({
        network: 'base-sepolia',
        constraints: {
          maxPerTransaction: '10.00',
          dailyLimit: '100.00',
        },
      });
      wallet.updateBalance('10000000', '0');
    });

    it('should sign a valid payment', async () => {
      const result = await wallet.signPayment({
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '0.50',
        resource: 'test-tool',
        reason: 'Test payment',
        nonce: '0x' + '0'.repeat(64),
        expiry: Math.floor(Date.now() / 1000) + 300,
      });

      expect(result.signature).toMatch(/^0x[a-fA-F0-9]+$/);
      expect(result.txRecord).toBeDefined();
      expect(result.txRecord.type).toBe('payment');
      expect(result.txRecord.status).toBe('signed');
    });

    it('should track transaction in history', async () => {
      await wallet.signPayment({
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '0.25',
        resource: 'test-tool',
        reason: 'Test payment',
        nonce: '0x' + '1'.repeat(64),
        expiry: Math.floor(Date.now() / 1000) + 300,
      });

      const history = wallet.getHistory({ limit: 10 });

      expect(history.length).toBe(1);
      expect(history[0].amount).toBe('0.25');
    });

    it('should update stats after payment', async () => {
      const statsBefore = wallet.stats;

      await wallet.signPayment({
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '0.50',
        resource: 'test-tool',
        reason: 'Test payment',
        nonce: '0x' + '2'.repeat(64),
        expiry: Math.floor(Date.now() / 1000) + 300,
      });

      const statsAfter = wallet.stats;

      expect(parseFloat(statsAfter.sessionSpent)).toBeGreaterThan(parseFloat(statsBefore.sessionSpent));
      expect(statsAfter.transactionCount).toBe(statsBefore.transactionCount + 1);
    });
  });

  describe('updateBalance', () => {
    it('should update available and locked balances', async () => {
      const wallet = await createAgentWallet('base-sepolia');

      wallet.updateBalance('5000000', '1000000'); // $5 available, $1 locked

      expect(wallet.balance.available).toBe('5000000');
      expect(wallet.balance.locked).toBe('1000000');
      expect(wallet.balance.total).toBe('6000000');
    });
  });

  describe('getHistory', () => {
    let wallet: AgentWallet;

    beforeEach(async () => {
      wallet = await AgentWallet.create({
        network: 'base-sepolia',
        constraints: {
          maxPerTransaction: '10.00',
          dailyLimit: '100.00',
        },
      });
      wallet.updateBalance('10000000', '0');

      // Create some transactions
      for (let i = 0; i < 5; i++) {
        await wallet.signPayment({
          recipient: '0x1234567890123456789012345678901234567890',
          amount: '0.10',
          resource: `tool-${i}`,
          reason: `Payment ${i}`,
          nonce: '0x' + i.toString().repeat(64).slice(0, 64),
          expiry: Math.floor(Date.now() / 1000) + 300,
        });
      }
    });

    it('should return all transactions', () => {
      const history = wallet.getHistory();

      expect(history.length).toBe(5);
    });

    it('should respect limit parameter', () => {
      const history = wallet.getHistory({ limit: 3 });

      expect(history.length).toBe(3);
    });

    it('should filter by status', () => {
      const history = wallet.getHistory({ status: 'signed' });

      expect(history.every(tx => tx.status === 'signed')).toBe(true);
    });

    it('should filter by since timestamp', async () => {
      const midpoint = Date.now();

      // Wait a bit then create more transactions
      await new Promise(resolve => setTimeout(resolve, 10));

      await wallet.signPayment({
        recipient: '0x1234567890123456789012345678901234567890',
        amount: '0.10',
        resource: 'new-tool',
        reason: 'New payment',
        nonce: '0x' + 'a'.repeat(64),
        expiry: Math.floor(Date.now() / 1000) + 300,
      });

      const history = wallet.getHistory({ since: midpoint });

      expect(history.length).toBe(1);
      expect(history[0].resource).toBe('new-tool');
    });
  });
});
