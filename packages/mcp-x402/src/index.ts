// ============================================================
// SYNAPSE MCP x402 - The Agent Economy Protocol
// ============================================================
//
// Revolutionary infrastructure for autonomous AI agent payments:
//
// - Agent Wallets: Cryptographic identity for economic participation
// - Payment Channels: Efficient micropayments (1000s of txs, 2 on-chain)
// - Intent Resolution: Agents express WHAT, protocol finds HOW
// - Tool Registry: Decentralized discovery with staking & reputation
// - Safety Protocol: Multi-layer protection against runaway spending
// - Server SDK: Monetize any MCP server with one wrapper
// - Client SDK: Auto-pay for tools within budget constraints
//
// ============================================================

// Core types and utilities
export * from './types.js';

// Agent primitives
export * from './agent/index.js';

// Payment channels
export * from './channels/index.js';

// Intent-based payments
export * from './intents/index.js';

// Tool registry
export * from './registry/index.js';

// Safety protocol
export * from './safety/index.js';

// Server SDK
export * from './server/index.js';

// Client SDK
export * from './client/index.js';

// Crypto utilities (EIP-712)
export * from './crypto/index.js';

// Settlement (Thirdweb integration)
export * from './settlement/index.js';

// ============================================================
// Quick Start Exports
// ============================================================

import { AgentWallet, createAgentWallet } from './agent/index.js';
import { PaymentChannel, PaymentChannelManager } from './channels/index.js';
import { IntentResolver, IntentBuilder, intent } from './intents/index.js';
import { ToolRegistry } from './registry/index.js';
import { AgentSafetyProtocol, DEFAULT_SAFETY_CONFIG } from './safety/index.js';
import { MonetizedServer, monetize } from './server/index.js';
import { AutoPayClient, createAutoPayClient } from './client/index.js';
import { X402Network } from './types.js';

/**
 * Create a complete agent economy stack
 */
export async function createAgentEconomy(config: {
  network: X402Network;
  privateKey?: string;
  budget: {
    maxPerTransaction: string;
    sessionBudget: string;
    autoApproveUnder?: string;
  };
}) {
  // Create wallet
  const wallet = await createAgentWallet(config.network);

  // Create registry
  const registry = new ToolRegistry(config.network);

  // Create safety
  const safety = new AgentSafetyProtocol(DEFAULT_SAFETY_CONFIG);

  // Create auto-pay client
  const client = new AutoPayClient({
    wallet,
    network: config.network,
    budget: {
      maxPerTransaction: config.budget.maxPerTransaction,
      sessionBudget: config.budget.sessionBudget,
      autoApproveUnder: config.budget.autoApproveUnder || config.budget.maxPerTransaction,
    },
    enableSafety: true,
  });

  // Create channel manager
  const channels = new PaymentChannelManager({
    network: config.network,
    sender: wallet.address,
    signer: async (msg) => '0x', // Will be implemented with wallet
  });

  return {
    wallet,
    registry,
    safety,
    client,
    channels,
    // Helper to fulfill intents
    fulfill: async (intentDescription: string, maxBudget: string) => {
      const resolver = new IntentResolver({
        registry: {
          findByCapability: (cap) => registry.findByCapability(cap),
          search: (q) => registry.search(q),
          getById: async (id) => {
            const tool = await registry.getById(id);
            if (!tool) return null;
            const stats = registry.getStats(id);
            const rep = registry.getReputation(id);
            return {
              id: tool.id,
              name: tool.name,
              provider: tool.provider,
              price: tool.price,
              reputation: rep?.score ?? 0,
              avgLatency: stats?.avgResponseTime ?? 0,
              capabilities: tool.capabilities,
              matchScore: 0,
              endpoint: tool.endpoint,
            };
          },
        },
        paymentHandler: {
          pay: async (recipient, amount, resource) => {
            const { signature, txRecord } = await wallet.signPayment({
              recipient,
              amount,
              resource,
              reason: `Intent: ${intentDescription}`,
              nonce: '0x' + Math.random().toString(16).slice(2).padStart(64, '0'),
              expiry: Math.floor(Date.now() / 1000) + 300,
            });
            return { paymentId: txRecord.id };
          },
          getAvailableBudget: async () => wallet.balance.available,
        },
        executor: {
          execute: async (tool, args) => {
            // In production, would call the actual tool
            return { result: 'executed' };
          },
        },
        network: config.network,
      });

      return resolver.fulfill({
        description: intentDescription,
        maxBudget,
      });
    },
  };
}

// Re-export for convenience
export {
  AgentWallet,
  createAgentWallet,
  PaymentChannel,
  PaymentChannelManager,
  IntentResolver,
  IntentBuilder,
  intent,
  ToolRegistry,
  AgentSafetyProtocol,
  DEFAULT_SAFETY_CONFIG,
  MonetizedServer,
  monetize,
  AutoPayClient,
  createAutoPayClient,
};
