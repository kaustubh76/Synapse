// ============================================================
// SYNAPSE MCP SDK - Unified Entry Points
// One-liner to create monetized MCPs with auto-identity
// ============================================================

import { EventEmitter } from 'eventemitter3';
import { nanoid } from 'nanoid';
import {
  MCPIdentityFactory,
  getMCPIdentityFactory,
  type MCPIdentityWithWallet,
} from '../identity/mcp-identity.js';
import {
  BilateralSessionManager,
  getBilateralSessionManager,
  type BilateralSession,
} from '../bilateral/bilateral-session.js';
import { AgentWallet, createAgentWallet } from '../agent/wallet.js';
import { MonetizedServer, type PricingConfig } from '../server/monetize.js';
import { AutoPayClient, createAutoPayClient } from '../client/auto-pay.js';
import type { X402Network } from '../types.js';

// -------------------- TYPES --------------------

export interface ToolDefinition {
  name: string;
  description: string;
  price?: number;
  inputSchema?: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler?: (input: Record<string, unknown>) => Promise<unknown>;
}

export interface SynapseMCPServerConfig {
  /** Server name (used for identity) */
  name: string;
  /** Tool definitions */
  tools: ToolDefinition[];
  /** Pricing configuration */
  pricing?: PricingConfig;
  /** Network to use */
  network?: X402Network;
  /** Restore existing identity */
  privateKey?: string;
}

export interface SynapseMCPServer {
  /** MCP server with monetization */
  server: MonetizedServer;
  /** Cryptographic identity */
  identity: MCPIdentityWithWallet;
  /** Agent wallet */
  wallet: AgentWallet;
  /** Bilateral session manager */
  billing: BilateralSessionManager;
  /** Server address */
  address: string;
  /** Export identity for persistence */
  exportIdentity: () => { clientId: string; privateKey: string; network: string } | null;
}

export interface SynapseMCPClientConfig {
  /** Client name (used for identity) */
  name?: string;
  /** Restore existing identity */
  privateKey?: string;
  /** Max spend per session */
  budget?: number;
  /** Network to use */
  network?: X402Network;
  /** Auto-approve under this amount */
  autoApproveUnder?: number;
}

export interface SynapseMCPClient {
  /** Auto-pay client */
  autoPay: AutoPayClient;
  /** Cryptographic identity */
  identity: MCPIdentityWithWallet;
  /** Agent wallet */
  wallet: AgentWallet;
  /** Client address */
  address: string;
  /** Export identity for persistence */
  exportIdentity: () => { clientId: string; privateKey: string; network: string } | null;
  /** Connect to an MCP server */
  connect: (serverUrl: string) => Promise<SynapseMCPConnection>;
}

export interface SynapseMCPConnection {
  /** Session ID */
  sessionId: string;
  /** Server address */
  serverAddress: string;
  /** Call a tool with auto-payment */
  callTool: (toolName: string, input: Record<string, unknown>) => Promise<unknown>;
  /** Get session balance */
  getBalance: () => { spent: number; remaining: number };
  /** Close connection and settle */
  close: () => Promise<{ netSettlement: number; direction: string }>;
}

// -------------------- SDK FUNCTIONS --------------------

/**
 * Create a monetized MCP server with auto-identity
 *
 * @example
 * ```typescript
 * const { server, identity, wallet } = await createSynapseMCP({
 *   name: 'my-data-provider',
 *   tools: [
 *     { name: 'getData', price: 0.01 },
 *     { name: 'analyze', price: 0.05 },
 *   ],
 * });
 *
 * console.log(`MCP running with wallet: ${identity.address}`);
 * ```
 */
export async function createSynapseMCP(
  config: SynapseMCPServerConfig
): Promise<SynapseMCPServer> {
  const network = config.network || 'base-sepolia';
  const identityFactory = getMCPIdentityFactory({ network });

  // Create or restore identity
  let identity: MCPIdentityWithWallet;
  if (config.privateKey) {
    identity = await identityFactory.restoreIdentity(config.privateKey, config.name);
  } else {
    identity = await identityFactory.getOrCreateIdentity(config.name);
  }

  // Create agent wallet from identity
  const wallet = await createAgentWallet(network);

  // Build tool-specific pricing
  const toolPricing: Record<string, string> = {};
  for (const tool of config.tools) {
    if (tool.price) {
      toolPricing[tool.name] = String(tool.price);
    }
  }

  // Create monetized server
  const server = new MonetizedServer({
    recipient: identity.address,
    network,
    pricing: config.pricing || {
      defaultPrice: '0.01',
      tools: toolPricing,
    },
  });

  // Create bilateral session manager
  const billing = getBilateralSessionManager();

  console.log(`[Synapse MCP] Server created: ${config.name}`);
  console.log(`[Synapse MCP] Wallet address: ${identity.address}`);
  console.log(`[Synapse MCP] Tools: ${config.tools.map((t) => t.name).join(', ')}`);

  return {
    server,
    identity,
    wallet,
    billing,
    address: identity.address,
    exportIdentity: () => identityFactory.exportIdentity(identity.clientId),
  };
}

/**
 * Create an MCP client with auto-pay and auto-identity
 *
 * @example
 * ```typescript
 * const { client, identity, autoPay } = await createSynapseClient({
 *   budget: 5.00, // $5 max spend
 * });
 *
 * // Tools are called with automatic payment
 * const result = await client.callTool('getData', { query: 'BTC price' });
 * ```
 */
export async function createSynapseClient(
  config?: SynapseMCPClientConfig
): Promise<SynapseMCPClient> {
  const network = config?.network || 'base-sepolia';
  const identityFactory = getMCPIdentityFactory({ network });
  const clientName = config?.name || `client_${nanoid(8)}`;

  // Create or restore identity
  let identity: MCPIdentityWithWallet;
  if (config?.privateKey) {
    identity = await identityFactory.restoreIdentity(config.privateKey, clientName);
  } else {
    identity = await identityFactory.getOrCreateIdentity(clientName);
  }

  // Create agent wallet from identity
  const wallet = await createAgentWallet(network);

  // Create auto-pay client
  const autoPay = new AutoPayClient({
    wallet,
    network,
    budget: {
      maxPerTransaction: String(config?.autoApproveUnder || 0.1),
      sessionBudget: String(config?.budget || 10),
      autoApproveUnder: String(config?.autoApproveUnder || 0.05),
    },
    enableSafety: true,
  });

  console.log(`[Synapse Client] Created: ${clientName}`);
  console.log(`[Synapse Client] Wallet address: ${identity.address}`);
  console.log(`[Synapse Client] Budget: $${config?.budget || 10}`);

  return {
    autoPay,
    identity,
    wallet,
    address: identity.address,
    exportIdentity: () => identityFactory.exportIdentity(identity.clientId),
    connect: async (serverUrl: string) => {
      // Create connection (simplified - in production would use MCP transport)
      const sessionId = `session_${nanoid(12)}`;
      let spent = 0;
      const budget = config?.budget || 10;

      return {
        sessionId,
        serverAddress: serverUrl,
        callTool: async (toolName: string, input: Record<string, unknown>) => {
          // In production, this would use the actual MCP protocol
          console.log(`[Synapse Client] Calling tool: ${toolName}`);

          // Simulate payment
          const estimatedCost = 0.01;
          if (spent + estimatedCost > budget) {
            throw new Error('Insufficient budget');
          }
          spent += estimatedCost;

          return { success: true, tool: toolName, input };
        },
        getBalance: () => ({
          spent,
          remaining: budget - spent,
        }),
        close: async () => ({
          netSettlement: spent,
          direction: 'client-to-server',
        }),
      };
    },
  };
}

// -------------------- BILATERAL HELPERS --------------------

/**
 * Create a bilateral session between client and server
 *
 * @example
 * ```typescript
 * const session = await createBilateralSession(
 *   clientIdentity,
 *   serverIdentity
 * );
 *
 * // Client uses server's tool
 * session.recordClientPayment(0.01, 'weather.current');
 *
 * // Server uses client's data
 * session.recordServerPayment(0.02, 'client-data');
 *
 * // Settle at end
 * const settlement = await session.settle();
 * // { netAmount: 0.01, direction: 'server-to-client' }
 * ```
 */
export async function createBilateralSession(
  client: MCPIdentityWithWallet,
  server: MCPIdentityWithWallet
): Promise<{
  sessionId: string;
  recordClientPayment: (amount: number, resource: string) => void;
  recordServerPayment: (amount: number, resource: string) => void;
  getBalance: () => { clientPaid: number; serverPaid: number; net: number };
  settle: () => Promise<{ netAmount: number; direction: string }>;
}> {
  const billing = getBilateralSessionManager();

  const session = billing.createSession(
    { id: client.clientId, address: client.address },
    { id: server.clientId, address: server.address }
  );

  return {
    sessionId: session.sessionId,
    recordClientPayment: (amount: number, resource: string) => {
      billing.recordClientPayment(session.sessionId, amount, resource);
    },
    recordServerPayment: (amount: number, resource: string) => {
      billing.recordServerPayment(session.sessionId, amount, resource);
    },
    getBalance: () => {
      const s = billing.getSession(session.sessionId);
      return {
        clientPaid: s?.clientPaidTotal || 0,
        serverPaid: s?.serverPaidTotal || 0,
        net: s?.netBalance || 0,
      };
    },
    settle: async () => {
      const result = await billing.settleSession(session.sessionId);
      return {
        netAmount: result.netAmount,
        direction: result.direction,
      };
    },
  };
}
