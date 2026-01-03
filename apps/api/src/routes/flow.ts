// ============================================================
// SYNAPSE FLOW API
// Unified endpoint for complete LLM → Intent → x402 → MCP flow
// Real USDC transfers using EigenCloud wallet
// ============================================================

import { Router, Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import {
  getLLMIntentBridge,
  getLLMExecutionEngine,
  getMCPToolBridge,
  getRealToolProvider,
  getAgentCreditScorer,
  type LLMIntentRequest,
  type LLMIntentParams,
  type MCPToolRequest,
} from '@synapse/core';
import {
  getMCPIdentityFactory,
  getBilateralSessionManager,
  getPaymentVerifier,
  getEigenWallet,
  getUSDCTransfer,
  type MCPIdentityWithWallet,
} from '@synapse/mcp-x402';

const router = Router();

// EigenCloud wallet configuration
const EIGENCLOUD_PRIVATE_KEY = process.env.EIGENCLOUD_PRIVATE_KEY || '';
const EIGENCLOUD_WALLET_ADDRESS = process.env.EIGENCLOUD_WALLET_ADDRESS || '0xcF1A4587a4470634fc950270cab298B79b258eDe';

// Platform wallet for payments
const PLATFORM_WALLET = process.env.PLATFORM_WALLET || process.env.SYNAPSE_PLATFORM_WALLET || '0x742d35Cc6634C0532925a3b844Bc9e7595f5bE21';

// Enable real transfers (default to true when EIGENCLOUD_PRIVATE_KEY is set)
const USE_REAL_TRANSFERS = process.env.USE_REAL_TRANSFERS !== 'false' && !!EIGENCLOUD_PRIVATE_KEY;

// Flow session storage
const flowSessions = new Map<string, FlowSession>();

interface FlowSession {
  id: string;
  agentId: string;
  agentAddress: string;
  bilateralSessionId: string;
  llmIntentId?: string;
  selectedModelId?: string;
  toolIntentIds: string[];
  transactions: FlowTransaction[];
  totalSpent: number;
  status: 'active' | 'completed' | 'settled';
  createdAt: number;
}

interface FlowTransaction {
  id: string;
  type: 'llm' | 'tool';
  resource: string;
  amount: number;
  txHash?: string;
  verified?: boolean;
  blockNumber?: number;
  timestamp: number;
  isRealTransfer?: boolean;
  explorerUrl?: string;
}

// Helper: Execute real USDC transfer - NO SIMULATION FALLBACK
async function executeUSDCPayment(
  amount: number,
  reason: string
): Promise<{ txHash: string; blockNumber?: number; isReal: boolean; explorerUrl?: string }> {
  // REQUIRE real wallet configuration - no simulations
  if (!EIGENCLOUD_PRIVATE_KEY) {
    throw new Error('EIGENCLOUD_PRIVATE_KEY not configured. Real payments require wallet setup.');
  }

  const usdcTransfer = getUSDCTransfer();
  console.log(`[Flow] Executing real USDC transfer: ${amount} USDC - ${reason}`);

  const result = await usdcTransfer.transferWithPrivateKey(
    EIGENCLOUD_PRIVATE_KEY,
    {
      recipient: PLATFORM_WALLET,
      amount,
      reason,
    }
  );

  if (!result.success || !result.txHash) {
    throw new Error(`USDC transfer failed: ${result.error || 'Unknown error'}`);
  }

  console.log(`[Flow] Real transfer complete: ${result.txHash}`);
  return {
    txHash: result.txHash,
    blockNumber: result.blockNumber,
    isReal: true,
    explorerUrl: result.explorerUrl,
  };
}

/**
 * POST /api/flow/start
 * Start a new flow session with agent identity
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { agentId, agentName } = req.body;

    const identityFactory = getMCPIdentityFactory();
    const bilateralManager = getBilateralSessionManager();

    // Get or create agent identity
    let identity: MCPIdentityWithWallet;
    if (agentId) {
      try {
        identity = await identityFactory.getOrCreateIdentity(agentId);
      } catch {
        identity = await identityFactory.getOrCreateIdentity(agentName || `flow-agent-${Date.now()}`);
      }
    } else {
      identity = await identityFactory.getOrCreateIdentity(agentName || `flow-agent-${Date.now()}`);
    }

    // Create bilateral session
    const bilateralSession = bilateralManager.createSession(
      { id: identity.clientId, address: identity.address },
      { id: 'synapse-platform', address: PLATFORM_WALLET }
    );

    // Create flow session
    const flowSession: FlowSession = {
      id: `flow_${identity.clientId}_${Date.now()}`,
      agentId: identity.clientId,
      agentAddress: identity.address,
      bilateralSessionId: bilateralSession.sessionId,
      toolIntentIds: [],
      transactions: [],
      totalSpent: 0,
      status: 'active',
      createdAt: Date.now(),
    };

    flowSessions.set(flowSession.id, flowSession);

    res.json({
      success: true,
      data: {
        flowSessionId: flowSession.id,
        agentId: identity.clientId,
        agentAddress: identity.address,
        bilateralSessionId: bilateralSession.sessionId,
        publicKey: identity.publicKey,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Flow API] Start error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FLOW_START_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

/**
 * POST /api/flow/:flowId/llm
 * Submit LLM intent and get competing bids
 */
router.post('/:flowId/llm', async (req: Request, res: Response) => {
  try {
    const { flowId } = req.params;
    const { prompt, modelTier, maxTokens, temperature } = req.body;

    const flowSession = flowSessions.get(flowId);
    if (!flowSession) {
      return res.status(404).json({
        success: false,
        error: { code: 'FLOW_NOT_FOUND', message: 'Flow session not found' },
        timestamp: Date.now(),
      });
    }

    const engine = getLLMExecutionEngine();
    const intentId = `flow_llm_${flowId}_${Date.now()}`;

    // Execute LLM comparison using execution engine
    const params: LLMIntentParams = {
      prompt,
      modelTier: modelTier || 'balanced',
      maxTokens: maxTokens || 500,
      temperature: temperature ?? 0.7,
      minModels: 3,
      maxModels: 5,
      compareBy: ['cost', 'quality', 'latency'],
      selectionMode: 'manual',
    };

    const result = await engine.executeComparison(intentId, params);

    // Update flow session
    flowSession.llmIntentId = intentId;
    flowSessions.set(flowId, flowSession);

    // Map results to bid-like format for consistency
    const bids = result.results.map((r, idx) => ({
      id: `bid_${r.modelId}_${Date.now()}`,
      modelId: r.modelId,
      provider: r.provider,
      response: r.response,
      cost: r.cost,
      latency: r.latencyMs,
      qualityScore: r.qualityScore || 0.8,
      tokenCount: r.tokenUsage,
      rank: idx + 1,
    }));

    res.json({
      success: true,
      data: {
        intentId,
        status: 'COMPLETED',
        bids,
        comparison: result.comparison,
        totalCost: result.totalCost,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Flow API] LLM error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'LLM_INTENT_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

/**
 * POST /api/flow/:flowId/select
 * Select LLM model and record payment with optional on-chain verification
 */
router.post('/:flowId/select', async (req: Request, res: Response) => {
  try {
    const { flowId } = req.params;
    const { modelId, paymentTxHash, verifyOnChain } = req.body;

    const flowSession = flowSessions.get(flowId);
    if (!flowSession || !flowSession.llmIntentId) {
      return res.status(404).json({
        success: false,
        error: { code: 'FLOW_NOT_FOUND', message: 'Flow session or LLM intent not found' },
        timestamp: Date.now(),
      });
    }

    const llmBridge = getLLMIntentBridge();
    const bilateralManager = getBilateralSessionManager();

    // Select model
    const selectionCost = 0.005; // Fixed selection cost
    let paymentVerified = false;
    let blockNumber: number | undefined;

    // If txHash provided and verification requested, verify on-chain
    if (paymentTxHash && verifyOnChain) {
      const verifier = getPaymentVerifier();
      console.log(`[Flow API] Verifying payment tx ${paymentTxHash} for ${selectionCost} USDC`);

      const verificationResult = await verifier.verifyPayment(paymentTxHash, {
        amount: selectionCost,
        recipient: PLATFORM_WALLET,
        sender: flowSession.agentAddress,
        tolerance: 0.01, // 1% tolerance
      });

      paymentVerified = verificationResult.verified;
      blockNumber = verificationResult.blockNumber;

      if (!paymentVerified) {
        console.warn(`[Flow API] Payment verification failed: ${verificationResult.error}`);
        // Continue anyway but mark as unverified
      } else {
        console.log(`[Flow API] Payment verified! Block: ${blockNumber}`);
      }
    }

    llmBridge.selectModel(flowSession.llmIntentId, modelId, paymentTxHash);
    flowSession.selectedModelId = modelId;

    // Record in bilateral session
    bilateralManager.recordClientPayment(
      flowSession.bilateralSessionId,
      selectionCost,
      `llm.${modelId}`
    );

    // Add transaction with verification status
    const tx: FlowTransaction = {
      id: `tx_${Date.now()}`,
      type: 'llm',
      resource: modelId,
      amount: selectionCost,
      txHash: paymentTxHash,
      verified: paymentVerified,
      blockNumber,
      timestamp: Date.now(),
    };
    flowSession.transactions.push(tx);
    flowSession.totalSpent += selectionCost;
    flowSessions.set(flowId, flowSession);

    // Get the selected bid's response for tool parsing
    const intent = llmBridge.getIntent(flowSession.llmIntentId);
    const selectedBid = intent?.llmBids.find(b => b.modelId === modelId);

    // Parse tool suggestions from response
    const toolCalls = parseToolCalls(selectedBid?.response || '');

    const verifier = getPaymentVerifier();

    res.json({
      success: true,
      data: {
        modelId,
        paymentTxHash,
        paymentVerified,
        blockNumber,
        explorerUrl: paymentTxHash ? verifier.getExplorerUrl(paymentTxHash) : null,
        cost: selectionCost,
        response: selectedBid?.response,
        suggestedTools: toolCalls,
        totalSpent: flowSession.totalSpent,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Flow API] Select error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SELECT_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

/**
 * POST /api/flow/:flowId/tool
 * Execute MCP tool with payment and optional on-chain verification
 */
router.post('/:flowId/tool', async (req: Request, res: Response) => {
  try {
    const { flowId } = req.params;
    const { toolName, toolInput, paymentTxHash, verifyOnChain } = req.body;

    const flowSession = flowSessions.get(flowId);
    if (!flowSession) {
      return res.status(404).json({
        success: false,
        error: { code: 'FLOW_NOT_FOUND', message: 'Flow session not found' },
        timestamp: Date.now(),
      });
    }

    const mcpBridge = getMCPToolBridge();
    const bilateralManager = getBilateralSessionManager();

    // Create tool intent
    const toolRequest: MCPToolRequest = {
      toolName,
      toolInput: toolInput || {},
      capabilities: [],
      maxBudget: 0.01,
      clientAddress: flowSession.agentAddress,
    };

    const toolIntent = await mcpBridge.createToolIntent(toolRequest);
    flowSession.toolIntentIds.push(toolIntent.id);

    // Tool execution cost
    const toolCost = 0.001;
    let paymentVerified = false;
    let blockNumber: number | undefined;

    // If txHash provided and verification requested, verify on-chain
    if (paymentTxHash && verifyOnChain) {
      const verifier = getPaymentVerifier();
      console.log(`[Flow API] Verifying tool payment tx ${paymentTxHash} for ${toolCost} USDC`);

      const verificationResult = await verifier.verifyPayment(paymentTxHash, {
        amount: toolCost,
        recipient: PLATFORM_WALLET,
        sender: flowSession.agentAddress,
        tolerance: 0.01, // 1% tolerance
      });

      paymentVerified = verificationResult.verified;
      blockNumber = verificationResult.blockNumber;

      if (!paymentVerified) {
        console.warn(`[Flow API] Tool payment verification failed: ${verificationResult.error}`);
      } else {
        console.log(`[Flow API] Tool payment verified! Block: ${blockNumber}`);
      }
    }

    // Record in bilateral session
    bilateralManager.recordClientPayment(
      flowSession.bilateralSessionId,
      toolCost,
      toolName
    );

    // Add transaction with verification status
    const tx: FlowTransaction = {
      id: `tx_${Date.now()}`,
      type: 'tool',
      resource: toolName,
      amount: toolCost,
      txHash: paymentTxHash,
      verified: paymentVerified,
      blockNumber,
      timestamp: Date.now(),
    };
    flowSession.transactions.push(tx);
    flowSession.totalSpent += toolCost;
    flowSessions.set(flowId, flowSession);

    // Execute real tool with actual API data
    const output = await executeRealTool(toolName, toolInput);
    const verifier = getPaymentVerifier();

    res.json({
      success: true,
      data: {
        intentId: toolIntent.id,
        toolName,
        output,
        cost: toolCost,
        paymentTxHash,
        paymentVerified,
        blockNumber,
        explorerUrl: paymentTxHash ? verifier.getExplorerUrl(paymentTxHash) : null,
        totalSpent: flowSession.totalSpent,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Flow API] Tool error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TOOL_EXECUTION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

/**
 * POST /api/flow/:flowId/settle
 * Settle the flow session
 */
router.post('/:flowId/settle', async (req: Request, res: Response) => {
  try {
    const { flowId } = req.params;

    const flowSession = flowSessions.get(flowId);
    if (!flowSession) {
      return res.status(404).json({
        success: false,
        error: { code: 'FLOW_NOT_FOUND', message: 'Flow session not found' },
        timestamp: Date.now(),
      });
    }

    const bilateralManager = getBilateralSessionManager();

    // ALWAYS use platform wallet for settlements (it has ETH for gas + USDC)
    // Agent wallets are dynamically created without ETH, so they can't pay gas fees
    const privateKey = EIGENCLOUD_PRIVATE_KEY;

    if (!privateKey) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_PLATFORM_KEY',
          message: 'EIGENCLOUD_PRIVATE_KEY not configured. Platform wallet is required for settlements.',
        },
        timestamp: Date.now(),
      });
    }

    console.log(`[Flow API] Settling session ${flowSession.bilateralSessionId} using platform wallet`);

    // Settle bilateral session with REAL USDC transfer
    const settlement = await bilateralManager.settleSessionWithPayment(
      flowSession.bilateralSessionId,
      privateKey
    );

    // Update flow session
    flowSession.status = 'settled';
    flowSessions.set(flowId, flowSession);

    // Build explorer URL for the transaction
    const explorerUrl = settlement.txHash
      ? `https://sepolia.basescan.org/tx/${settlement.txHash}`
      : undefined;

    res.json({
      success: true,
      data: {
        flowSessionId: flowId,
        bilateralSessionId: flowSession.bilateralSessionId,
        settlement: {
          netAmount: settlement.netAmount,
          direction: settlement.direction,
          from: settlement.from,
          to: settlement.to,
          transactionCount: settlement.transactionCount,
          txHash: settlement.txHash,
          blockNumber: settlement.blockNumber,
          explorerUrl,
        },
        totalSpent: flowSession.totalSpent,
        transactions: flowSession.transactions,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Flow API] Settle error:', error);
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
 * GET /api/flow/:flowId
 * Get flow session status
 */
router.get('/:flowId', (req: Request, res: Response) => {
  const { flowId } = req.params;

  const flowSession = flowSessions.get(flowId);
  if (!flowSession) {
    return res.status(404).json({
      success: false,
      error: { code: 'FLOW_NOT_FOUND', message: 'Flow session not found' },
      timestamp: Date.now(),
    });
  }

  res.json({
    success: true,
    data: {
      ...flowSession,
    },
    timestamp: Date.now(),
  });
});

/**
 * POST /api/flow/execute
 * Execute complete flow in one call (for autonomous agents)
 */
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { prompt, agentId, maxBudget } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PROMPT', message: 'prompt is required' },
        timestamp: Date.now(),
      });
    }

    const identityFactory = getMCPIdentityFactory();
    const bilateralManager = getBilateralSessionManager();
    const engine = getLLMExecutionEngine();
    const mcpBridge = getMCPToolBridge();

    // Step 1: Get or create identity
    const identity = await identityFactory.getOrCreateIdentity(
      agentId || `auto-agent-${Date.now()}`
    );

    // Step 2: Create bilateral session
    const bilateralSession = bilateralManager.createSession(
      { id: identity.clientId, address: identity.address },
      { id: 'synapse-platform', address: PLATFORM_WALLET }
    );

    // Step 3: Execute LLM comparison
    const intentId = `flow_exec_${Date.now()}`;
    const params: LLMIntentParams = {
      prompt,
      modelTier: 'balanced',
      maxTokens: 500,
      temperature: 0.7,
      minModels: 3,
      maxModels: 5,
      compareBy: ['cost', 'quality', 'latency'],
      selectionMode: 'manual',
    };

    const llmResult = await engine.executeComparison(intentId, params);

    if (!llmResult.results || llmResult.results.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_BIDS', message: 'No LLM responses received' },
        timestamp: Date.now(),
      });
    }

    // Step 4: Auto-select best model
    const bestResult = llmResult.results[0];
    const selectionCost = bestResult.cost || 0.005;

    // Execute real USDC payment for LLM selection
    const llmPayment = await executeUSDCPayment(selectionCost, `LLM selection: ${bestResult.modelId}`);

    bilateralManager.recordClientPayment(bilateralSession.sessionId, selectionCost, `llm.${bestResult.modelId}`);

    const transactions: FlowTransaction[] = [{
      id: `tx_${Date.now()}`,
      type: 'llm',
      resource: bestResult.modelId,
      amount: selectionCost,
      txHash: llmPayment.txHash,
      blockNumber: llmPayment.blockNumber,
      isRealTransfer: llmPayment.isReal,
      explorerUrl: llmPayment.explorerUrl,
      timestamp: Date.now(),
    }];

    let totalSpent = selectionCost;

    // Step 5: Parse tool calls and execute
    const toolCalls = parseToolCalls(bestResult.response);
    const toolResults: any[] = [];

    for (const tool of toolCalls) {
      const toolIntent = await mcpBridge.createToolIntent({
        toolName: tool.name,
        toolInput: tool.params,
        capabilities: [],
        maxBudget: 0.01,
        clientAddress: identity.address,
      });

      const toolCost = 0.001;

      // Execute real USDC payment for tool usage
      const toolPayment = await executeUSDCPayment(toolCost, `Tool: ${tool.name}`);

      bilateralManager.recordClientPayment(bilateralSession.sessionId, toolCost, tool.name);

      transactions.push({
        id: `tx_${Date.now()}`,
        type: 'tool',
        resource: tool.name,
        amount: toolCost,
        txHash: toolPayment.txHash,
        blockNumber: toolPayment.blockNumber,
        isRealTransfer: toolPayment.isReal,
        explorerUrl: toolPayment.explorerUrl,
        timestamp: Date.now(),
      });

      totalSpent += toolCost;

      // Execute real tool
      const toolOutput = await executeRealTool(tool.name, tool.params);

      toolResults.push({
        toolName: tool.name,
        intentId: toolIntent.id,
        output: toolOutput,
        cost: toolCost,
        txHash: toolPayment.txHash,
        isRealTransfer: toolPayment.isReal,
        explorerUrl: toolPayment.explorerUrl,
      });
    }

    res.json({
      success: true,
      data: {
        agentId: identity.clientId,
        agentAddress: identity.address,
        bilateralSessionId: bilateralSession.sessionId,
        eigencloudWallet: EIGENCLOUD_WALLET_ADDRESS,
        useRealTransfers: USE_REAL_TRANSFERS,
        llm: {
          intentId,
          modelId: bestResult.modelId,
          provider: bestResult.provider,
          response: bestResult.response,
          cost: selectionCost,
          txHash: llmPayment.txHash,
          isRealTransfer: llmPayment.isReal,
          explorerUrl: llmPayment.explorerUrl,
          allBids: llmResult.results.map((r, idx) => ({
            modelId: r.modelId,
            provider: r.provider,
            cost: r.cost,
            latency: r.latencyMs,
            rank: idx + 1,
          })),
        },
        tools: toolResults,
        transactions,
        totalSpent,
        prompt,
        comparison: llmResult.comparison,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Flow API] Execute error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FLOW_EXECUTE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

// Helper: Parse tool calls from LLM response
function parseToolCalls(response: string): { name: string; params: any }[] {
  const tools: { name: string; params: any }[] = [];

  if (/weather|temperature|forecast/i.test(response)) {
    const cityMatch = response.match(/(?:in|for|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    tools.push({
      name: 'weather.current',
      params: { city: cityMatch ? cityMatch[1] : 'New York' },
    });
  }

  if (/bitcoin|btc|ethereum|eth|crypto|price/i.test(response)) {
    const coinMatch = response.match(/(?:BTC|ETH|bitcoin|ethereum)/i);
    tools.push({
      name: 'crypto.price',
      params: { symbol: coinMatch ? coinMatch[0].toUpperCase().replace('BITCOIN', 'BTC').replace('ETHEREUM', 'ETH') : 'BTC' },
    });
  }

  return tools;
}

// Helper: Execute real tool with actual API data
async function executeRealTool(toolName: string, params: any): Promise<any> {
  const toolProvider = getRealToolProvider();

  console.log(`[Flow API] Executing REAL tool: ${toolName} with params:`, params);

  const result = await toolProvider.executeTool(toolName, params);

  if (result.success && result.data) {
    console.log(`[Flow API] Tool ${toolName} returned real data from ${result.source} in ${result.latencyMs}ms`);
    return {
      ...result.data,
      _meta: {
        source: result.source,
        latencyMs: result.latencyMs,
        timestamp: result.timestamp,
        isRealData: true,
      },
    };
  }

  // If real data fetch failed, log but still return error info
  console.warn(`[Flow API] Tool ${toolName} failed: ${result.error}`);
  return {
    error: result.error,
    source: result.source,
    _meta: {
      source: result.source,
      latencyMs: result.latencyMs,
      timestamp: result.timestamp,
      isRealData: false,
      failed: true,
    },
  };
}

// Sync wrapper for compatibility (prefer async executeRealTool)
function generateToolOutput(toolName: string, params: any): any {
  // This is now just a fallback - real execution should use executeRealTool
  console.warn(`[Flow API] Using sync generateToolOutput - prefer async executeRealTool`);
  return {
    toolName,
    params,
    _meta: {
      warning: 'Sync fallback used - use executeRealTool for real data',
      timestamp: Date.now(),
    },
  };
}

// -------------------- EIGEN WALLET ENDPOINTS --------------------

/**
 * GET /api/flow/wallet/status
 * Get EigenWallet status and balance
 */
router.get('/wallet/status', async (req: Request, res: Response) => {
  try {
    const eigenWallet = getEigenWallet();
    const balance = await eigenWallet.getBalance();

    res.json({
      success: true,
      data: {
        address: eigenWallet.address,
        isConfigured: eigenWallet.isConfigured,
        canSign: eigenWallet.canSign,
        balance: {
          usdc: balance.usdc,
          eth: balance.eth,
          canTransfer: balance.canTransfer,
          hasGas: balance.hasGas,
        },
        platformWallet: eigenWallet.getPlatformWallet(),
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Flow API] Wallet status error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'WALLET_STATUS_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

/**
 * POST /api/flow/:flowId/pay
 * Execute real USDC payment using EigenWallet
 */
router.post('/:flowId/pay', async (req: Request, res: Response) => {
  try {
    const { flowId } = req.params;
    const { amount, resource, type } = req.body;

    const flowSession = flowSessions.get(flowId);
    if (!flowSession) {
      return res.status(404).json({
        success: false,
        error: { code: 'FLOW_NOT_FOUND', message: 'Flow session not found' },
        timestamp: Date.now(),
      });
    }

    const eigenWallet = getEigenWallet();

    // Check wallet is configured
    if (!eigenWallet.canSign) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'WALLET_NOT_CONFIGURED',
          message: 'EigenWallet not configured. Set EIGEN_WALLET_PRIVATE_KEY in environment.',
        },
        timestamp: Date.now(),
      });
    }

    // Check balance
    const balance = await eigenWallet.getBalance();
    if (!balance.canTransfer) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_BALANCE',
          message: `Insufficient balance. Have ${balance.usdc} USDC, need ${amount} USDC. Gas: ${balance.hasGas ? 'OK' : 'INSUFFICIENT'}`,
        },
        timestamp: Date.now(),
      });
    }

    if (balance.usdc < amount) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_USDC',
          message: `Insufficient USDC. Have ${balance.usdc}, need ${amount}`,
        },
        timestamp: Date.now(),
      });
    }

    console.log(`[Flow API] Executing EigenWallet payment: ${amount} USDC for ${resource}`);

    // Execute payment
    const paymentResult = await eigenWallet.payToPlatform(amount, resource);

    if (!paymentResult.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PAYMENT_FAILED',
          message: paymentResult.error || 'Payment failed',
        },
        timestamp: Date.now(),
      });
    }

    // Record in bilateral session
    const bilateralManager = getBilateralSessionManager();
    bilateralManager.recordClientPayment(
      flowSession.bilateralSessionId,
      amount,
      resource
    );

    // Record in credit score system with blockchain txHash
    try {
      const creditScorer = getAgentCreditScorer();
      await creditScorer.recordPayment(
        flowSession.agentId,
        amount,
        true, // onTime payment
        paymentResult.txHash,
        paymentResult.blockNumber
      );
      console.log(`[Flow API] Credit payment recorded with txHash: ${paymentResult.txHash}`);
    } catch (creditError) {
      console.warn('[Flow API] Failed to record credit payment:', creditError);
      // Don't fail the payment if credit recording fails
    }

    // Add transaction to flow session
    const tx: FlowTransaction = {
      id: `tx_${Date.now()}`,
      type: type || 'llm',
      resource,
      amount,
      txHash: paymentResult.txHash,
      verified: true, // Real transaction is verified by blockchain
      blockNumber: paymentResult.blockNumber,
      timestamp: Date.now(),
    };
    flowSession.transactions.push(tx);
    flowSession.totalSpent += amount;
    flowSessions.set(flowId, flowSession);

    console.log(`[Flow API] Payment successful! Tx: ${paymentResult.txHash}`);

    res.json({
      success: true,
      data: {
        txHash: paymentResult.txHash,
        blockNumber: paymentResult.blockNumber,
        amount: paymentResult.amount,
        sender: paymentResult.sender,
        recipient: paymentResult.recipient,
        explorerUrl: paymentResult.explorerUrl,
        totalSpent: flowSession.totalSpent,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Flow API] Pay error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PAYMENT_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

/**
 * POST /api/flow/:flowId/select-and-pay
 * Select LLM model and execute real USDC payment atomically
 */
router.post('/:flowId/select-and-pay', async (req: Request, res: Response) => {
  try {
    const { flowId } = req.params;
    const { modelId } = req.body;

    const flowSession = flowSessions.get(flowId);
    if (!flowSession || !flowSession.llmIntentId) {
      return res.status(404).json({
        success: false,
        error: { code: 'FLOW_NOT_FOUND', message: 'Flow session or LLM intent not found' },
        timestamp: Date.now(),
      });
    }

    const eigenWallet = getEigenWallet();

    // Check wallet is configured
    if (!eigenWallet.canSign) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'WALLET_NOT_CONFIGURED',
          message: 'EigenWallet not configured. Set EIGEN_WALLET_PRIVATE_KEY in environment.',
        },
        timestamp: Date.now(),
      });
    }

    const selectionCost = 0.005;

    // Check balance
    const balance = await eigenWallet.getBalance();
    if (balance.usdc < selectionCost) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_USDC',
          message: `Insufficient USDC. Have ${balance.usdc}, need ${selectionCost}`,
        },
        timestamp: Date.now(),
      });
    }

    console.log(`[Flow API] Executing select-and-pay for model ${modelId}`);

    // Execute payment first
    const paymentResult = await eigenWallet.payToPlatform(selectionCost, `llm.${modelId}`);

    if (!paymentResult.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PAYMENT_FAILED',
          message: paymentResult.error || 'Payment failed',
        },
        timestamp: Date.now(),
      });
    }

    // Now select the model
    const llmBridge = getLLMIntentBridge();
    const bilateralManager = getBilateralSessionManager();

    llmBridge.selectModel(flowSession.llmIntentId, modelId, paymentResult.txHash);
    flowSession.selectedModelId = modelId;

    // Record in bilateral session
    bilateralManager.recordClientPayment(
      flowSession.bilateralSessionId,
      selectionCost,
      `llm.${modelId}`
    );

    // Record in credit score system with blockchain txHash
    try {
      const creditScorer = getAgentCreditScorer();
      await creditScorer.recordPayment(
        flowSession.agentId,
        selectionCost,
        true, // onTime payment
        paymentResult.txHash,
        paymentResult.blockNumber
      );
      console.log(`[Flow API] Credit payment recorded for select-and-pay: ${paymentResult.txHash}`);
    } catch (creditError) {
      console.warn('[Flow API] Failed to record credit payment:', creditError);
    }

    // Add transaction
    const tx: FlowTransaction = {
      id: `tx_${Date.now()}`,
      type: 'llm',
      resource: modelId,
      amount: selectionCost,
      txHash: paymentResult.txHash,
      verified: true,
      blockNumber: paymentResult.blockNumber,
      timestamp: Date.now(),
    };
    flowSession.transactions.push(tx);
    flowSession.totalSpent += selectionCost;
    flowSessions.set(flowId, flowSession);

    // Get the selected bid's response
    const intent = llmBridge.getIntent(flowSession.llmIntentId);
    const selectedBid = intent?.llmBids.find(b => b.modelId === modelId);
    const toolCalls = parseToolCalls(selectedBid?.response || '');

    console.log(`[Flow API] Select-and-pay successful! Tx: ${paymentResult.txHash}`);

    res.json({
      success: true,
      data: {
        modelId,
        paymentTxHash: paymentResult.txHash,
        paymentVerified: true,
        blockNumber: paymentResult.blockNumber,
        explorerUrl: paymentResult.explorerUrl,
        cost: selectionCost,
        response: selectedBid?.response,
        suggestedTools: toolCalls,
        totalSpent: flowSession.totalSpent,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Flow API] Select-and-pay error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SELECT_AND_PAY_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

/**
 * POST /api/flow/:flowId/tool-and-pay
 * Execute MCP tool with real USDC payment
 */
router.post('/:flowId/tool-and-pay', async (req: Request, res: Response) => {
  try {
    const { flowId } = req.params;
    const { toolName, toolInput } = req.body;

    const flowSession = flowSessions.get(flowId);
    if (!flowSession) {
      return res.status(404).json({
        success: false,
        error: { code: 'FLOW_NOT_FOUND', message: 'Flow session not found' },
        timestamp: Date.now(),
      });
    }

    const eigenWallet = getEigenWallet();

    if (!eigenWallet.canSign) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'WALLET_NOT_CONFIGURED',
          message: 'EigenWallet not configured. Set EIGEN_WALLET_PRIVATE_KEY in environment.',
        },
        timestamp: Date.now(),
      });
    }

    const toolCost = 0.001;

    // Check balance
    const balance = await eigenWallet.getBalance();
    if (balance.usdc < toolCost) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_USDC',
          message: `Insufficient USDC. Have ${balance.usdc}, need ${toolCost}`,
        },
        timestamp: Date.now(),
      });
    }

    console.log(`[Flow API] Executing tool-and-pay for ${toolName}`);

    // Execute payment
    const paymentResult = await eigenWallet.payToPlatform(toolCost, toolName);

    if (!paymentResult.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PAYMENT_FAILED',
          message: paymentResult.error || 'Payment failed',
        },
        timestamp: Date.now(),
      });
    }

    // Create tool intent
    const mcpBridge = getMCPToolBridge();
    const bilateralManager = getBilateralSessionManager();

    const toolRequest: MCPToolRequest = {
      toolName,
      toolInput: toolInput || {},
      capabilities: [],
      maxBudget: 0.01,
      clientAddress: flowSession.agentAddress,
    };

    const toolIntent = await mcpBridge.createToolIntent(toolRequest);
    flowSession.toolIntentIds.push(toolIntent.id);

    // Record in bilateral session
    bilateralManager.recordClientPayment(
      flowSession.bilateralSessionId,
      toolCost,
      toolName
    );

    // Add transaction
    const tx: FlowTransaction = {
      id: `tx_${Date.now()}`,
      type: 'tool',
      resource: toolName,
      amount: toolCost,
      txHash: paymentResult.txHash,
      verified: true,
      blockNumber: paymentResult.blockNumber,
      timestamp: Date.now(),
    };
    flowSession.transactions.push(tx);
    flowSession.totalSpent += toolCost;
    flowSessions.set(flowId, flowSession);

    // Execute real tool with actual API data
    const output = await executeRealTool(toolName, toolInput);

    console.log(`[Flow API] Tool-and-pay successful! Tx: ${paymentResult.txHash}`);

    // Record in credit score system with blockchain txHash
    try {
      const creditScorer = getAgentCreditScorer();
      await creditScorer.recordPayment(
        flowSession.agentId,
        toolCost,
        true, // onTime payment
        paymentResult.txHash,
        paymentResult.blockNumber
      );
      console.log(`[Flow API] Tool payment credit recorded with txHash: ${paymentResult.txHash}`);
    } catch (creditError) {
      console.warn('[Flow API] Failed to record tool credit payment:', creditError);
      // Don't fail the request - payment already succeeded
    }

    res.json({
      success: true,
      data: {
        intentId: toolIntent.id,
        toolName,
        output,
        cost: toolCost,
        paymentTxHash: paymentResult.txHash,
        paymentVerified: true,
        blockNumber: paymentResult.blockNumber,
        explorerUrl: paymentResult.explorerUrl,
        totalSpent: flowSession.totalSpent,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Flow API] Tool-and-pay error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TOOL_AND_PAY_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

export function setupFlowRoutes(app: any, io?: SocketIOServer): void {
  app.use('/api/flow', router);
  console.log('[Flow API] Routes mounted at /api/flow');
}

export default router;
