// ============================================================
// SYNAPSE MCP GATEWAY - Request Handler
// Processes MCP protocol requests
// ============================================================

import { EventEmitter } from 'events';
import type {
  MCPRequest,
  MCPResponse,
  MCPNotification,
  MCPError,
  MCPErrorCode,
  MCPSession,
  ToolCallArgs,
  ToolExecutionResult,
  SynapseAuthParams,
  MCP_PROTOCOL_VERSION,
} from './types.js';
import { getSessionManager, SessionManager } from './session-manager.js';
import { getToolGenerator, ToolGenerator, toolNameToIntentType } from './tool-generator.js';

const API_URL = process.env.SYNAPSE_API_URL || 'http://localhost:3001';

// API Response types
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

interface IntentData {
  id: string;
  status: string;
  type: string;
  assignedProvider?: string;
  result?: {
    data?: unknown;
    providerName?: string;
    settledAmount?: number;
    txHash?: string;
  };
  error?: string;
  failoverAttempts?: number;
}

interface ProviderData {
  id: string;
  name: string;
  reputationScore: number;
  status: string;
  capabilities: string[];
}

export class MCPHandler extends EventEmitter {
  private sessionManager: SessionManager;
  private toolGenerator: ToolGenerator;
  private sessionId: string | null = null;

  constructor() {
    super();
    this.sessionManager = getSessionManager();
    this.toolGenerator = getToolGenerator();
  }

  /**
   * Process an MCP request
   */
  async processRequest(request: MCPRequest): Promise<MCPResponse> {
    try {
      switch (request.method) {
        case 'initialize':
          return this.handleInitialize(request);
        case 'ping':
          return this.handlePing(request);
        case 'tools/list':
          return await this.handleToolsList(request);
        case 'tools/call':
          return await this.handleToolsCall(request);
        case 'resources/list':
          return this.handleResourcesList(request);
        case 'resources/read':
          return this.handleResourcesRead(request);
        case 'prompts/list':
          return this.handlePromptsList(request);
        case 'prompts/get':
          return this.handlePromptsGet(request);
        // Synapse extensions
        case 'synapse/authenticate':
          return this.handleSynapseAuthenticate(request);
        case 'synapse/getBalance':
          return this.handleSynapseGetBalance(request);
        case 'synapse/getHistory':
          return this.handleSynapseGetHistory(request);
        case 'synapse/closeSession':
          return this.handleSynapseCloseSession(request);
        default:
          return this.errorResponse(request.id, -32601, `Method not found: ${request.method}`);
      }
    } catch (error) {
      console.error('[MCP Handler] Error:', error);
      return this.errorResponse(
        request.id,
        -32603,
        error instanceof Error ? error.message : 'Internal error'
      );
    }
  }

  /**
   * Handle initialize request
   */
  private handleInitialize(request: MCPRequest): MCPResponse {
    const params = request.params as {
      protocolVersion?: string;
      clientInfo?: { name: string; version: string };
      capabilities?: Record<string, unknown>;
    };

    // Create session
    const session = this.sessionManager.createSession(
      params?.clientInfo || { name: 'unknown', version: '0.0.0' }
    );
    this.sessionId = session.id;

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: 'synapse-mcp-gateway',
          version: '1.0.0',
        },
        capabilities: {
          tools: {},
          resources: { subscribe: true },
          prompts: {},
        },
        _synapse: {
          sessionId: session.id,
          budget: session.budget,
          authenticated: false,
        },
      },
    };
  }

  /**
   * Handle ping request
   */
  private handlePing(request: MCPRequest): MCPResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {},
    };
  }

  /**
   * Handle tools/list request
   */
  private async handleToolsList(request: MCPRequest): Promise<MCPResponse> {
    // Update tools from provider registry
    await this.refreshTools();

    const tools = this.toolGenerator.getAllTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      // Include Synapse metadata as extension
      ...(tool._synapse && { _synapse: tool._synapse }),
    }));

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: { tools },
    };
  }

  /**
   * Handle tools/call request
   */
  private async handleToolsCall(request: MCPRequest): Promise<MCPResponse> {
    const params = request.params as ToolCallArgs;

    if (!params?.name) {
      return this.errorResponse(request.id, -32602, 'Missing tool name');
    }

    // Check session
    if (!this.sessionId) {
      return this.errorResponse(request.id, -32003, 'Session not initialized');
    }

    const session = this.sessionManager.getSession(this.sessionId);
    if (!session) {
      return this.errorResponse(request.id, -32003, 'Session expired or invalid');
    }

    // Ensure tools are refreshed for proper mappings
    await this.refreshTools();

    // Handle Synapse core tools
    if (this.toolGenerator.isCoreTools(params.name)) {
      return this.handleSynapseTool(request, params);
    }

    // Execute intent via Synapse API
    const startTime = Date.now();
    const result = await this.executeIntent(params, session);

    // Record latency
    this.sessionManager.recordLatency(this.sessionId, Date.now() - startTime);

    if (result.isError) {
      this.sessionManager.recordError(this.sessionId);
      return this.errorResponse(
        request.id,
        -32603,
        result.content[0]?.text || 'Execution failed'
      );
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: result,
    };
  }

  /**
   * Execute an intent via Synapse API
   */
  private async executeIntent(
    params: ToolCallArgs,
    session: MCPSession
  ): Promise<ToolExecutionResult> {
    const intentType = toolNameToIntentType(params.name);
    const mapping = this.toolGenerator.getMapping(params.name);

    const maxBudget = params._meta?.maxBudget || mapping?.defaultBudget || 0.02;
    const timeout = params._meta?.timeout || mapping?.defaultTimeout || 30000;

    // Check budget
    if (!this.sessionManager.hasSufficientBudget(session.id, maxBudget)) {
      return {
        content: [{ type: 'text', text: 'Insufficient budget for this tool call' }],
        isError: true,
      };
    }

    try {
      // Create intent
      const intentBody = {
        type: intentType,
        category: mapping?.category || 'data',
        params: params.arguments || {},
        maxBudget,
        biddingDuration: 3000,
        clientAddress: session.walletAddress,
        source: 'mcp',
      };
      console.log('[MCP Handler] Creating intent:', JSON.stringify(intentBody));

      const createResponse = await fetch(`${API_URL}/api/intents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(intentBody),
      });

      const createData = (await createResponse.json()) as ApiResponse<IntentData>;
      console.log('[MCP Handler] Intent response:', JSON.stringify(createData));

      if (!createData.success || !createData.data) {
        return {
          content: [{ type: 'text', text: createData.error?.message || 'Failed to create intent' }],
          isError: true,
        };
      }

      const intentId = createData.data.id;

      // Emit progress notification
      this.emit('progress', {
        tool: params.name,
        status: 'bidding',
        intentId,
      });

      // Poll for completion
      const result = await this.waitForCompletion(intentId, timeout);

      if (!result.success) {
        return {
          content: [{ type: 'text', text: result.error || 'Intent execution failed' }],
          isError: true,
          _synapse: {
            intentId,
            provider: result.provider || 'unknown',
            cost: 0,
            latency: result.latency || 0,
            failoverUsed: result.failoverUsed || false,
          },
        };
      }

      // Deduct budget
      const actualCost = result.cost || 0.005;
      this.sessionManager.deductBudget(
        session.id,
        actualCost,
        params.name,
        intentId,
        result.providerId || 'unknown',
        result.providerName || 'unknown'
      );

      // Format result
      const text = this.formatResult(params.name, result.data);

      return {
        content: [{ type: 'text', text }],
        _synapse: {
          intentId,
          provider: result.providerName || 'unknown',
          cost: actualCost,
          latency: result.latency || 0,
          txHash: result.txHash,
          failoverUsed: result.failoverUsed || false,
          failoverReason: result.failoverReason,
        },
      };
    } catch (error) {
      return {
        content: [
          { type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` },
        ],
        isError: true,
      };
    }
  }

  /**
   * Wait for intent completion with polling
   */
  private async waitForCompletion(
    intentId: string,
    timeout: number
  ): Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
    providerId?: string;
    providerName?: string;
    cost?: number;
    latency?: number;
    txHash?: string;
    failoverUsed?: boolean;
    failoverReason?: string;
    provider?: string;
  }> {
    const startTime = Date.now();
    const pollInterval = 500;

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`${API_URL}/api/intents/${intentId}`);
        const data = (await response.json()) as ApiResponse<{ intent: IntentData }>;

        if (!data.success) {
          return { success: false, error: 'Failed to get intent status' };
        }

        const intent = data.data?.intent;
        if (!intent) {
          await this.sleep(pollInterval);
          continue;
        }

        if (intent.status === 'COMPLETED') {
          return {
            success: true,
            data: intent.result?.data,
            providerId: intent.assignedProvider,
            providerName: intent.result?.providerName || intent.assignedProvider,
            cost: intent.result?.settledAmount,
            latency: Date.now() - startTime,
            txHash: intent.result?.txHash,
            failoverUsed: (intent.failoverAttempts || 0) > 0,
          };
        }

        if (intent.status === 'FAILED') {
          return {
            success: false,
            error: intent.error || 'Intent failed',
            provider: intent.assignedProvider,
            latency: Date.now() - startTime,
            failoverUsed: (intent.failoverAttempts || 0) > 0,
          };
        }

        // Still in progress
        await this.sleep(pollInterval);
      } catch (error) {
        await this.sleep(pollInterval);
      }
    }

    return { success: false, error: 'Timeout waiting for intent completion' };
  }

  /**
   * Format result for display
   */
  private formatResult(toolName: string, data: unknown): string {
    if (!data) return 'No data returned';

    if (typeof data === 'string') return data;

    const d = data as Record<string, unknown>;

    // Format based on tool type
    if (toolName.includes('crypto') && d.price) {
      return `${d.symbol || 'Asset'}: $${Number(d.price).toLocaleString()}${
        d.change24h ? ` (${Number(d.change24h) > 0 ? '+' : ''}${Number(d.change24h).toFixed(2)}%)` : ''
      }`;
    }

    if (toolName.includes('weather') && d.temperature !== undefined) {
      return `${d.city || 'Location'}: ${d.temperature}°${d.unit === 'celsius' ? 'C' : 'F'}, ${d.condition || 'Unknown'}`;
    }

    if (toolName.includes('news') && Array.isArray(d.articles)) {
      const articles = d.articles as Array<{ title: string; source?: string }>;
      return articles.map((a, i) => `${i + 1}. ${a.title}${a.source ? ` (${a.source})` : ''}`).join('\n');
    }

    return JSON.stringify(data, null, 2);
  }

  /**
   * Handle Synapse core tools
   */
  private async handleSynapseTool(
    request: MCPRequest,
    params: ToolCallArgs
  ): Promise<MCPResponse> {
    switch (params.name) {
      case 'synapse_check_balance':
        return this.handleSynapseGetBalance(request);

      case 'synapse_list_capabilities':
        return this.handleListCapabilities(request);

      case 'synapse_get_providers': {
        const capability = (params.arguments as Record<string, string>)?.capability;
        if (!capability) {
          return this.errorResponse(request.id, -32602, 'Missing capability parameter');
        }
        return this.handleGetProviders(request, capability);
      }

      case 'synapse_execute_intent': {
        const args = params.arguments as Record<string, unknown>;
        if (!args?.type) {
          return this.errorResponse(request.id, -32602, 'Missing type parameter');
        }
        // Convert to regular tool call
        const toolName = String(args.type).replace('.', '_get_');
        return this.handleToolsCall({
          ...request,
          params: {
            name: toolName,
            arguments: args.params,
            _meta: {
              maxBudget: args.maxBudget as number,
              timeout: args.timeout as number,
            },
          },
        });
      }

      case 'synapse_get_quote': {
        const args = params.arguments as Record<string, unknown>;
        if (!args?.type) {
          return this.errorResponse(request.id, -32602, 'Missing type parameter');
        }
        return this.handleGetQuote(request, args);
      }

      default:
        return this.errorResponse(request.id, -32601, `Unknown Synapse tool: ${params.name}`);
    }
  }

  /**
   * Handle list capabilities
   */
  private handleListCapabilities(request: MCPRequest): MCPResponse {
    const tools = this.toolGenerator.getAllTools();
    const capabilities = tools
      .filter((t) => !t.name.startsWith('synapse_'))
      .map((t) => ({
        name: t._synapse?.capability || t.name,
        description: t.description,
        providers: t._synapse?.providers || 0,
        estimatedPrice: t._synapse?.estimatedPrice || 'unknown',
        avgLatency: t._synapse?.avgLatency || 0,
      }));

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [
          {
            type: 'text',
            text: `Available capabilities:\n${capabilities
              .map(
                (c) =>
                  `- ${c.name}: ${c.description} (${c.providers} providers, ~${c.estimatedPrice})`
              )
              .join('\n')}`,
          },
        ],
      },
    };
  }

  /**
   * Handle get providers
   */
  private async handleGetProviders(
    request: MCPRequest,
    capability: string
  ): Promise<MCPResponse> {
    try {
      const response = await fetch(`${API_URL}/api/providers/discover/${capability}`);
      const data = (await response.json()) as ApiResponse<ProviderData[]>;

      if (!data.success || !data.data) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            content: [{ type: 'text', text: 'No providers found for this capability' }],
          },
        };
      }

      const providers = data.data;

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [
            {
              type: 'text',
              text: `Providers for ${capability}:\n${providers
                .map(
                  (p) =>
                    `- ${p.name} (Rep: ${p.reputationScore.toFixed(1)}/5, Status: ${p.status})`
                )
                .join('\n')}`,
            },
          ],
        },
      };
    } catch (error) {
      return this.errorResponse(request.id, -32603, 'Failed to fetch providers');
    }
  }

  /**
   * Handle get quote
   */
  private async handleGetQuote(
    request: MCPRequest,
    args: Record<string, unknown>
  ): Promise<MCPResponse> {
    try {
      const response = await fetch(`${API_URL}/api/providers/discover/${args.type}`);
      const data = (await response.json()) as ApiResponse<ProviderData[]>;

      if (!data.success || !data.data?.length) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            content: [
              { type: 'text', text: `No providers available for ${args.type}` },
            ],
          },
        };
      }

      const providers = data.data;

      // Estimate prices (simplified)
      const quotes = providers.slice(0, 5).map((p) => ({
        provider: p.name,
        estimatedPrice: (0.002 + Math.random() * 0.008).toFixed(4),
        reputation: p.reputationScore,
      }));

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [
            {
              type: 'text',
              text: `Price quotes for ${args.type}:\n${quotes
                .map(
                  (q) =>
                    `- ${q.provider}: ~$${q.estimatedPrice} (Rep: ${q.reputation.toFixed(1)}/5)`
                )
                .join('\n')}\n\nNote: Actual prices determined by competitive bidding.`,
            },
          ],
        },
      };
    } catch (error) {
      return this.errorResponse(request.id, -32603, 'Failed to get quotes');
    }
  }

  /**
   * Handle resources/list
   */
  private handleResourcesList(request: MCPRequest): MCPResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        resources: [
          {
            uri: 'synapse://providers',
            name: 'Provider List',
            description: 'List of all available providers on the Synapse network',
            mimeType: 'application/json',
          },
          {
            uri: 'synapse://capabilities',
            name: 'Capability Registry',
            description: 'Full registry of available capabilities',
            mimeType: 'application/json',
          },
          {
            uri: 'synapse://session',
            name: 'Current Session',
            description: 'Current session information and budget',
            mimeType: 'application/json',
          },
        ],
      },
    };
  }

  /**
   * Handle resources/read
   */
  private handleResourcesRead(request: MCPRequest): MCPResponse {
    const uri = (request.params as { uri: string })?.uri;

    if (uri === 'synapse://session' && this.sessionId) {
      const session = this.sessionManager.getSession(this.sessionId);
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(
                {
                  id: session?.id,
                  budget: session?.budget,
                  state: session?.state,
                  stats: this.sessionManager.getSessionStats(this.sessionId),
                },
                null,
                2
              ),
            },
          ],
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: { contents: [] },
    };
  }

  /**
   * Handle prompts/list
   */
  private handlePromptsList(request: MCPRequest): MCPResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        prompts: [
          {
            name: 'analyze_providers',
            description: 'Help choose between providers for a task',
            arguments: [
              { name: 'capability', description: 'The capability needed', required: true },
            ],
          },
          {
            name: 'optimize_budget',
            description: 'Suggest optimal budget for an intent',
            arguments: [
              { name: 'intentType', description: 'Type of intent', required: true },
            ],
          },
        ],
      },
    };
  }

  /**
   * Handle prompts/get
   */
  private handlePromptsGet(request: MCPRequest): MCPResponse {
    const name = (request.params as { name: string })?.name;

    if (name === 'analyze_providers') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          description: 'Analyze available providers for a capability',
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: 'Help me choose the best provider for {capability} based on reputation, price, and speed.',
              },
            },
          ],
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: { messages: [] },
    };
  }

  /**
   * Handle synapse/authenticate
   */
  private handleSynapseAuthenticate(request: MCPRequest): MCPResponse {
    const params = (request.params || {}) as Partial<SynapseAuthParams>;

    if (!this.sessionId) {
      return this.errorResponse(request.id, -32003, 'Session not initialized');
    }

    const session = this.sessionManager.getSession(this.sessionId);
    if (!session) {
      return this.errorResponse(request.id, -32003, 'Session not found');
    }

    // Update session with auth info
    session.walletAddress = params.walletAddress || session.walletAddress;
    if (params.budget !== undefined) {
      session.budget.initial = params.budget;
      session.budget.remaining = params.budget;
    }
    if (params.validUntil) {
      session.expiresAt = params.validUntil;
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        authenticated: true,
        sessionId: session.id,
        budget: session.budget,
        walletAddress: session.walletAddress,
        expiresAt: session.expiresAt,
      },
    };
  }

  /**
   * Handle synapse/getBalance
   */
  private handleSynapseGetBalance(request: MCPRequest): MCPResponse {
    if (!this.sessionId) {
      return this.errorResponse(request.id, -32003, 'Session not initialized');
    }

    const balance = this.sessionManager.getBalance(this.sessionId);
    if (!balance) {
      return this.errorResponse(request.id, -32003, 'Session not found');
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [
          {
            type: 'text',
            text: `Budget: $${balance.remaining.toFixed(4)} remaining of $${balance.initial.toFixed(2)} (${balance.transactions} transactions)`,
          },
        ],
        _synapse: balance,
      },
    };
  }

  /**
   * Handle synapse/getHistory
   */
  private handleSynapseGetHistory(request: MCPRequest): MCPResponse {
    if (!this.sessionId) {
      return this.errorResponse(request.id, -32003, 'Session not initialized');
    }

    const session = this.sessionManager.getSession(this.sessionId);
    if (!session) {
      return this.errorResponse(request.id, -32003, 'Session not found');
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        transactions: session.transactions,
        summary: this.sessionManager.getSessionStats(this.sessionId),
      },
    };
  }

  /**
   * Handle synapse/closeSession
   */
  private handleSynapseCloseSession(request: MCPRequest): MCPResponse {
    if (!this.sessionId) {
      return this.errorResponse(request.id, -32003, 'Session not initialized');
    }

    const session = this.sessionManager.closeSession(this.sessionId);
    if (!session) {
      return this.errorResponse(request.id, -32003, 'Failed to close session');
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        closed: true,
        sessionId: session.id,
        finalBudget: session.budget,
        stats: this.sessionManager.getSessionStats(session.id),
      },
    };
  }

  /**
   * Refresh tools from provider registry
   */
  private async refreshTools(): Promise<void> {
    try {
      const response = await fetch(`${API_URL}/api/providers`);
      const data = (await response.json()) as ApiResponse<ProviderData[]>;

      if (data.success && Array.isArray(data.data)) {
        this.toolGenerator.updateFromProviderRegistry(data.data);
      }
    } catch (error) {
      console.error('[MCP Handler] Failed to refresh tools:', error);
    }
  }

  /**
   * Create error response
   */
  private errorResponse(
    id: string | number,
    code: number,
    message: string,
    data?: unknown
  ): MCPResponse {
    const error: MCPError = {
      code,
      message,
    };
    if (data !== undefined) {
      error.data = data;
    }
    return {
      jsonrpc: '2.0',
      id,
      error,
    };
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
