// ============================================================
// MCP API ROUTES
// Routes for MCP identity, tool intents, and bilateral settlement
// ============================================================

import { Router, Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import {
  getMCPToolBridge,
  getRealToolProvider,
  type MCPToolRequest,
  type MCPToolProvider,
} from '@synapse/core';
import {
  getMCPIdentityFactory,
  getBilateralSessionManager,
} from '@synapse/mcp-x402';

const router = Router();

// ============================================================
// MCP IDENTITY ROUTES
// ============================================================

/**
 * POST /api/mcp/identity/create
 * Create a new MCP identity with wallet
 */
router.post('/identity/create', async (req: Request, res: Response) => {
  try {
    const { clientId, network } = req.body;

    const factory = getMCPIdentityFactory({
      network: network || 'base-sepolia',
    });

    const identity = await factory.createIdentity(clientId);

    res.json({
      success: true,
      data: {
        clientId: identity.clientId,
        address: identity.address,
        publicKey: identity.publicKey,
        walletType: identity.walletType,
        network: identity.network,
        createdAt: identity.createdAt,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[MCP API] Failed to create identity:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'IDENTITY_CREATE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

/**
 * POST /api/mcp/identity/restore
 * Restore an MCP identity from private key
 */
router.post('/identity/restore', async (req: Request, res: Response) => {
  try {
    const { privateKey, clientId, network } = req.body;

    if (!privateKey) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PRIVATE_KEY',
          message: 'privateKey is required',
        },
        timestamp: Date.now(),
      });
    }

    const factory = getMCPIdentityFactory({
      network: network || 'base-sepolia',
    });

    const identity = await factory.restoreIdentity(privateKey, clientId);

    res.json({
      success: true,
      data: {
        clientId: identity.clientId,
        address: identity.address,
        publicKey: identity.publicKey,
        walletType: identity.walletType,
        network: identity.network,
        createdAt: identity.createdAt,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[MCP API] Failed to restore identity:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'IDENTITY_RESTORE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/mcp/identity/:clientId
 * Get an existing identity
 */
router.get('/identity/:clientId', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const factory = getMCPIdentityFactory();

    const identity = await factory.getOrCreateIdentity(clientId);

    res.json({
      success: true,
      data: {
        clientId: identity.clientId,
        address: identity.address,
        publicKey: identity.publicKey,
        walletType: identity.walletType,
        network: identity.network,
        createdAt: identity.createdAt,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: {
        code: 'IDENTITY_NOT_FOUND',
        message: 'Identity not found',
      },
      timestamp: Date.now(),
    });
  }
});

// ============================================================
// MCP TOOL DIRECT EXECUTION (REAL APIS)
// ============================================================

/**
 * GET /api/mcp/tools
 * List all available real tools
 */
router.get('/tools', (_req: Request, res: Response) => {
  try {
    const tools = [
      {
        name: 'weather.current',
        description: 'Get current weather for a city (Open-Meteo API)',
        inputSchema: { city: 'string' },
        pricing: 0.005,
      },
      {
        name: 'crypto.price',
        description: 'Get current crypto price (CoinGecko API)',
        inputSchema: { symbol: 'string (BTC, ETH, SOL, etc.)' },
        pricing: 0.003,
      },
      {
        name: 'news.latest',
        description: 'Get latest news (HackerNews API)',
        inputSchema: { query: 'string (optional)' },
        pricing: 0.005,
      },
    ];

    res.json({
      success: true,
      data: {
        tools,
        count: tools.length,
        note: 'These tools call REAL external APIs',
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'TOOLS_LIST_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

/**
 * POST /api/mcp/tools/execute
 * Execute a tool directly (calls real APIs)
 */
router.post('/tools/execute', async (req: Request, res: Response) => {
  try {
    const { toolName, toolInput } = req.body;

    if (!toolName) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_TOOL_NAME',
          message: 'toolName is required',
        },
        timestamp: Date.now(),
      });
    }

    console.log(`[MCP] Executing real tool: ${toolName}`, toolInput);

    const toolProvider = getRealToolProvider();
    const result = await toolProvider.executeTool(toolName, toolInput || {});

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TOOL_EXECUTION_FAILED',
          message: result.error,
        },
        latencyMs: result.latencyMs,
        source: result.source,
        timestamp: Date.now(),
      });
    }

    res.json({
      success: true,
      data: result.data,
      latencyMs: result.latencyMs,
      source: result.source,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[MCP] Tool execution error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TOOL_EXECUTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

// ============================================================
// MCP TOOL INTENT ROUTES
// ============================================================

/**
 * POST /api/mcp/intent/create
 * Create a tool execution intent
 */
router.post('/intent/create', async (req: Request, res: Response) => {
  try {
    const {
      toolName,
      toolInput,
      capabilities,
      maxBudget,
      clientAddress,
      biddingDuration,
      preferredProviders,
    } = req.body;

    if (!toolName) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_TOOL_NAME',
          message: 'toolName is required',
        },
        timestamp: Date.now(),
      });
    }

    const bridge = getMCPToolBridge();

    const request: MCPToolRequest = {
      toolName,
      toolInput: toolInput || {},
      capabilities: capabilities || [],
      maxBudget: maxBudget || 0.1,
      clientAddress: clientAddress || '0x_anonymous',
      biddingDuration,
      preferredProviders,
    };

    const intent = await bridge.createToolIntent(request);

    res.json({
      success: true,
      data: {
        intentId: intent.id,
        status: intent.status,
        toolName: intent.params.toolName,
        biddingDeadline: intent.biddingDeadline,
        executionDeadline: intent.executionDeadline,
        bidsReceived: intent.toolBids.length,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[MCP API] Failed to create intent:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTENT_CREATE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/mcp/intent/:intentId
 * Get intent with bids
 */
router.get('/intent/:intentId', (req: Request, res: Response) => {
  try {
    const { intentId } = req.params;
    const bridge = getMCPToolBridge();

    const intent = bridge.getIntent(intentId);
    if (!intent) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'INTENT_NOT_FOUND',
          message: 'Intent not found',
        },
        timestamp: Date.now(),
      });
    }

    res.json({
      success: true,
      data: {
        intent: {
          id: intent.id,
          status: intent.status,
          type: intent.type,
          toolName: intent.params.toolName,
          maxBudget: intent.maxBudget,
          biddingDeadline: intent.biddingDeadline,
          executionDeadline: intent.executionDeadline,
          selectedToolId: intent.selectedToolId,
          assignedProvider: intent.assignedProvider,
        },
        bids: intent.toolBids.map((bid) => ({
          id: bid.id,
          providerId: bid.providerId,
          providerName: bid.providerName,
          toolId: bid.toolId,
          price: bid.price,
          estimatedLatency: bid.estimatedLatency,
          reliability: bid.reliability,
          score: bid.calculatedScore,
          rank: bid.rank,
          status: bid.status,
        })),
        bestBid: intent.toolBids[0]
          ? {
              providerId: intent.toolBids[0].providerId,
              providerName: intent.toolBids[0].providerName,
              price: intent.toolBids[0].price,
              score: intent.toolBids[0].calculatedScore,
            }
          : null,
        result: intent.executionResult,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTENT_GET_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

/**
 * POST /api/mcp/intent/:intentId/select
 * Select winning tool (or auto-select best)
 */
router.post('/intent/:intentId/select', async (req: Request, res: Response) => {
  try {
    const { intentId } = req.params;
    const { toolId } = req.body; // Optional - if not provided, selects best

    const bridge = getMCPToolBridge();

    const result = await bridge.selectTool(intentId, toolId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TOOL_SELECT_FAILED',
          message: result.error || 'Failed to select tool',
        },
        timestamp: Date.now(),
      });
    }

    res.json({
      success: true,
      data: {
        intentId,
        selectedToolId: result.bid?.toolId,
        selectedProvider: result.bid?.providerName,
        price: result.bid?.price,
        score: result.bid?.calculatedScore,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'TOOL_SELECT_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

/**
 * POST /api/mcp/intent/:intentId/execute
 * Record execution result
 */
router.post('/intent/:intentId/execute', (req: Request, res: Response) => {
  try {
    const { intentId } = req.params;
    const { output, executionTime, providerId, cost, paymentTxHash } = req.body;

    const bridge = getMCPToolBridge();

    bridge.recordExecution(intentId, {
      output,
      executionTime: executionTime || 0,
      providerId,
      cost: cost || 0,
      paymentTxHash,
    });

    const intent = bridge.getIntent(intentId);

    res.json({
      success: true,
      data: {
        intentId,
        status: intent?.status,
        result: intent?.executionResult,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'EXECUTION_RECORD_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

// ============================================================
// MCP PROVIDER ROUTES
// ============================================================

/**
 * POST /api/mcp/provider/register
 * Register an MCP tool provider
 */
router.post('/provider/register', (req: Request, res: Response) => {
  try {
    const {
      id,
      name,
      endpoint,
      tools,
      capabilities,
      reputationScore,
      reliability,
      avgLatency,
      priceMultiplier,
    } = req.body;

    if (!id || !name || !endpoint) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'id, name, and endpoint are required',
        },
        timestamp: Date.now(),
      });
    }

    const bridge = getMCPToolBridge();

    const provider: MCPToolProvider = {
      id,
      name,
      endpoint,
      tools: tools || [],
      capabilities: capabilities || [],
      reputationScore: reputationScore || 4.0,
      reliability: reliability || 0.95,
      avgLatency: avgLatency || 500,
      priceMultiplier: priceMultiplier || 1.0,
    };

    bridge.registerProvider(provider);

    res.json({
      success: true,
      data: {
        providerId: id,
        registered: true,
        tools: tools?.length || 0,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PROVIDER_REGISTER_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/mcp/providers
 * List all registered MCP providers
 */
router.get('/providers', (req: Request, res: Response) => {
  try {
    const bridge = getMCPToolBridge();
    const providers = bridge.getProviders();

    res.json({
      success: true,
      data: {
        providers: providers.map((p) => ({
          id: p.id,
          name: p.name,
          endpoint: p.endpoint,
          tools: p.tools,
          capabilities: p.capabilities,
          reputationScore: p.reputationScore,
          reliability: p.reliability,
          avgLatency: p.avgLatency,
        })),
        count: providers.length,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PROVIDERS_GET_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/mcp/providers/:toolName
 * Get providers for a specific tool
 */
router.get('/providers/:toolName', (req: Request, res: Response) => {
  try {
    const { toolName } = req.params;
    const bridge = getMCPToolBridge();
    const providers = bridge.getProvidersForTool(toolName);

    res.json({
      success: true,
      data: {
        toolName,
        providers: providers.map((p) => ({
          id: p.id,
          name: p.name,
          endpoint: p.endpoint,
          reputationScore: p.reputationScore,
          reliability: p.reliability,
          avgLatency: p.avgLatency,
          priceMultiplier: p.priceMultiplier,
        })),
        count: providers.length,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PROVIDERS_GET_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

// ============================================================
// BILATERAL SESSION ROUTES
// ============================================================

/**
 * POST /api/mcp/bilateral/create
 * Create a bilateral session
 */
router.post('/bilateral/create', (req: Request, res: Response) => {
  try {
    const { clientId, clientAddress, serverId, serverAddress, config } = req.body;

    if (!clientId || !clientAddress || !serverId || !serverAddress) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'clientId, clientAddress, serverId, serverAddress are required',
        },
        timestamp: Date.now(),
      });
    }

    const manager = getBilateralSessionManager(config);

    const session = manager.createSession(
      { id: clientId, address: clientAddress },
      { id: serverId, address: serverAddress }
    );

    res.json({
      success: true,
      data: {
        sessionId: session.sessionId,
        clientAddress: session.clientAddress,
        serverAddress: session.serverAddress,
        status: session.status,
        createdAt: session.createdAt,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[MCP API] Failed to create bilateral session:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'BILATERAL_CREATE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/mcp/bilateral/:sessionId
 * Get bilateral session
 */
router.get('/bilateral/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const manager = getBilateralSessionManager();

    const session = manager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Bilateral session not found',
        },
        timestamp: Date.now(),
      });
    }

    res.json({
      success: true,
      data: {
        sessionId: session.sessionId,
        clientId: session.clientId,
        clientAddress: session.clientAddress,
        serverId: session.serverId,
        serverAddress: session.serverAddress,
        clientPaidTotal: session.clientPaidTotal,
        serverPaidTotal: session.serverPaidTotal,
        netBalance: session.netBalance,
        transactionCount: session.transactions.length,
        status: session.status,
        createdAt: session.createdAt,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SESSION_GET_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

/**
 * POST /api/mcp/bilateral/:sessionId/client-payment
 * Record a client payment (client pays server)
 */
router.post('/bilateral/:sessionId/client-payment', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { amount, resource } = req.body;

    if (!amount || !resource) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'amount and resource are required',
        },
        timestamp: Date.now(),
      });
    }

    const manager = getBilateralSessionManager();
    const tx = manager.recordClientPayment(sessionId, amount, resource);

    if (!tx) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Bilateral session not found or not active',
        },
        timestamp: Date.now(),
      });
    }

    const session = manager.getSession(sessionId);

    res.json({
      success: true,
      data: {
        transactionId: tx.id,
        payer: tx.payer,
        payee: tx.payee,
        amount: tx.amount,
        resource: tx.resource,
        clientPaidTotal: session?.clientPaidTotal,
        netBalance: session?.netBalance,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PAYMENT_RECORD_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

/**
 * POST /api/mcp/bilateral/:sessionId/server-payment
 * Record a server payment (server pays client)
 */
router.post('/bilateral/:sessionId/server-payment', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { amount, resource } = req.body;

    if (!amount || !resource) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'amount and resource are required',
        },
        timestamp: Date.now(),
      });
    }

    const manager = getBilateralSessionManager();
    const tx = manager.recordServerPayment(sessionId, amount, resource);

    if (!tx) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Bilateral session not found or not active',
        },
        timestamp: Date.now(),
      });
    }

    const session = manager.getSession(sessionId);

    res.json({
      success: true,
      data: {
        transactionId: tx.id,
        payer: tx.payer,
        payee: tx.payee,
        amount: tx.amount,
        resource: tx.resource,
        serverPaidTotal: session?.serverPaidTotal,
        netBalance: session?.netBalance,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PAYMENT_RECORD_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

/**
 * POST /api/mcp/bilateral/:sessionId/settle
 * Settle a bilateral session
 */
router.post('/bilateral/:sessionId/settle', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const manager = getBilateralSessionManager();

    const result = await manager.settleSession(sessionId);

    res.json({
      success: true,
      data: {
        sessionId: result.sessionId,
        netAmount: result.netAmount,
        direction: result.direction,
        fromAddress: result.from,
        toAddress: result.to,
        transactionHash: result.txHash,
        settledAt: result.settledAt,
        totalTransactions: result.transactionCount,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SETTLE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/mcp/bilateral/:sessionId/transactions
 * Get all transactions in a bilateral session
 */
router.get('/bilateral/:sessionId/transactions', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const manager = getBilateralSessionManager();

    const session = manager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Bilateral session not found',
        },
        timestamp: Date.now(),
      });
    }

    res.json({
      success: true,
      data: {
        sessionId,
        transactions: session.transactions,
        summary: {
          clientPaidTotal: session.clientPaidTotal,
          serverPaidTotal: session.serverPaidTotal,
          netBalance: session.netBalance,
          transactionCount: session.transactions.length,
        },
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'TRANSACTIONS_GET_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

export default router;

export function setupMCPRoutes(
  app: { use: (path: string, router: Router) => void },
  io: SocketIOServer
): void {
  // Set up WebSocket event forwarding
  const bridge = getMCPToolBridge();
  const bilateralManager = getBilateralSessionManager();

  bridge.on('intent:created', (intent) => {
    io.to('dashboard').emit('mcp:intent:created', {
      intentId: intent.id,
      toolName: intent.params.toolName,
      maxBudget: intent.maxBudget,
      status: intent.status,
    });
  });

  bridge.on('bid:received', (bid, intent) => {
    io.to('dashboard').emit('mcp:bid:received', {
      intentId: intent.id,
      bidId: bid.id,
      providerName: bid.providerName,
      price: bid.price,
      score: bid.calculatedScore,
    });
  });

  bridge.on('tool:selected', (intent, toolId) => {
    io.to('dashboard').emit('mcp:tool:selected', {
      intentId: intent.id,
      toolId,
      provider: intent.assignedProvider,
    });
  });

  bridge.on('tool:executed', (intent, result) => {
    io.to('dashboard').emit('mcp:tool:executed', {
      intentId: intent.id,
      providerId: result.providerId,
      cost: result.cost,
      executionTime: result.executionTime,
    });
  });

  bilateralManager.on('session:created', (session) => {
    io.to('dashboard').emit('mcp:bilateral:created', {
      sessionId: session.sessionId,
      clientAddress: session.clientAddress,
      serverAddress: session.serverAddress,
    });
  });

  bilateralManager.on('transaction:recorded', (tx, session) => {
    io.to('dashboard').emit('mcp:bilateral:transaction', {
      sessionId: session.sessionId,
      transactionId: tx.id,
      payer: tx.payer,
      amount: tx.amount,
      netBalance: session.netBalance,
    });
  });

  bilateralManager.on('session:settled', (result) => {
    io.to('dashboard').emit('mcp:bilateral:settled', {
      sessionId: result.sessionId,
      netAmount: result.netAmount,
      direction: result.direction,
    });
  });

  app.use('/api/mcp', router);
  console.log('✅ MCP routes initialized');
}
