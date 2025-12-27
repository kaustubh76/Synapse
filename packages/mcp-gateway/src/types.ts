// ============================================================
// SYNAPSE MCP GATEWAY - Type Definitions
// ============================================================

import { z } from 'zod';

// MCP Protocol Version
export const MCP_PROTOCOL_VERSION = '2024-11-05';

// Session States
export type SessionState =
  | 'initializing'
  | 'active'
  | 'budget_depleted'
  | 'expired'
  | 'closed'
  | 'settled';

// MCP Identity (auto-generated wallet)
export interface MCPSessionIdentity {
  clientId: string;
  address: string;
  publicKey: string;
  createdAt: number;
  walletType: 'local' | 'crossmint';
  network: 'base' | 'base-sepolia';
}

// MCP Session
export interface MCPSession {
  id: string;
  clientInfo: {
    name: string;
    version: string;
  };
  walletAddress: string;
  // Auto-generated identity with wallet
  identity?: MCPSessionIdentity;
  budget: {
    initial: number;
    spent: number;
    remaining: number;
  };
  state: SessionState;
  createdAt: number;
  expiresAt: number;
  lastActivity: number;
  transactions: SessionTransaction[];
  stats: {
    toolsCalled: number;
    uniqueTools: Set<string>;
    providersUsed: Set<string>;
    totalLatency: number;
    errors: number;
  };
  // Bilateral session tracking
  bilateralSessionId?: string;
}

export interface SessionTransaction {
  id: string;
  timestamp: number;
  tool: string;
  intentId: string;
  providerId: string;
  providerName: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
}

// MCP Tool Definition (extended with Synapse metadata)
export interface SynapseMCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  // Synapse extension metadata
  _synapse?: {
    capability: string;
    estimatedPrice: string;
    providers: number;
    avgLatency: number;
    category: string;
  };
}

// Tool call arguments schema
export const ToolCallArgsSchema = z.object({
  name: z.string(),
  arguments: z.record(z.unknown()).optional(),
  _meta: z.object({
    maxBudget: z.number().optional(),
    timeout: z.number().optional(),
    preferFastest: z.boolean().optional(),
    preferCheapest: z.boolean().optional(),
    minReputation: z.number().optional(),
  }).optional(),
});

export type ToolCallArgs = z.infer<typeof ToolCallArgsSchema>;

// MCP Request/Response types
export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

export interface MCPNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

// MCP Error Codes
export const MCPErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom Synapse error codes
  INSUFFICIENT_BUDGET: -32000,
  PAYMENT_FAILED: -32001,
  RATE_LIMITED: -32002,
  SESSION_EXPIRED: -32003,
  PROVIDER_UNAVAILABLE: -32004,
  EXECUTION_TIMEOUT: -32005,
} as const;

// Synapse MCP Extensions
export interface SynapseAuthParams {
  x402Token?: string;
  walletAddress?: string;
  budget: number;
  validUntil?: number;
}

export interface SynapseBalanceResponse {
  initial: number;
  spent: number;
  remaining: number;
  transactions: number;
  lastUpdated: number;
}

export interface SynapseHistoryResponse {
  transactions: SessionTransaction[];
  summary: {
    totalSpent: number;
    toolsCalled: number;
    successRate: number;
    avgLatency: number;
  };
}

// Tool-to-Intent mapping configuration
export interface ToolIntentMapping {
  toolName: string;
  intentType: string;
  category: string;
  defaultBudget: number;
  defaultTimeout: number;
}

// Progress notification for tool execution
export interface ToolProgressNotification {
  status: 'bidding' | 'selecting' | 'executing' | 'failover' | 'settling';
  bids?: number;
  winner?: {
    providerId: string;
    providerName: string;
    price: number;
  };
  attempt?: number;
  message?: string;
}

// Tool execution result with Synapse metadata
export interface ToolExecutionResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  _synapse?: {
    intentId: string;
    provider: string;
    originalProvider?: string;
    cost: number;
    latency: number;
    txHash?: string;
    failoverUsed: boolean;
    failoverReason?: string;
    failoverAttempt?: number;
  };
  isError?: boolean;
}

// Provider capability for tool generation
export interface ProviderCapability {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  pricing: {
    basePrice: number;
    maxPrice?: number;
    dynamicPricing?: boolean;
  };
  sla?: {
    avgResponseTime: number;
    maxResponseTime: number;
    availability?: number;
  };
  providers: Array<{
    id: string;
    name: string;
    reputation: number;
  }>;
}
