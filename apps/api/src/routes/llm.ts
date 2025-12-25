// ============================================================
// SYNAPSE API - LLM COMPARISON ROUTES
// ============================================================

import { Router, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import {
  getLLMExecutionEngine,
  getAgentCreditScorer,
  getStreamingPaymentController,
  LLMIntentParams,
  LLMComparisonResult,
} from '@synapse/core/llm';

const router = Router();

// -------------------- MODELS & REGISTRY --------------------

/**
 * GET /api/llm/models
 * List all available LLM models
 */
router.get('/models', async (req: Request, res: Response) => {
  try {
    const engine = getLLMExecutionEngine();
    const models = engine.getAvailableModels();
    const stats = engine.getRegistryStats();

    res.json({
      success: true,
      data: {
        models,
        stats,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'MODELS_LIST_ERROR',
        message: error instanceof Error ? error.message : 'Failed to list models',
      },
    });
  }
});

/**
 * GET /api/llm/providers
 * List all provider health status
 */
router.get('/providers', async (req: Request, res: Response) => {
  try {
    const engine = getLLMExecutionEngine();
    const providers = ['openai', 'anthropic', 'google', 'ollama', 'together', 'groq'];

    const healthChecks = await Promise.all(
      providers.map(async (providerId) => {
        const isHealthy = await engine.checkProviderHealth(providerId);
        return { providerId, healthy: isHealthy };
      })
    );

    res.json({
      success: true,
      data: healthChecks,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PROVIDER_CHECK_ERROR',
        message: error instanceof Error ? error.message : 'Failed to check providers',
      },
    });
  }
});

// -------------------- LLM COMPARISON --------------------

/**
 * POST /api/llm/compare
 * Execute LLM comparison across multiple models
 */
router.post('/compare', async (req: Request, res: Response) => {
  try {
    const {
      prompt,
      systemPrompt,
      models,
      modelTier = 'balanced',
      minModels = 3,
      maxModels = 5,
      maxTokens = 1000,
      temperature = 0.7,
      compareBy = ['cost', 'quality', 'latency'],
      selectionMode = 'manual',
      agentId,
    } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PROMPT',
          message: 'Prompt is required',
        },
      });
    }

    const intentId = `llm_${nanoid()}`;
    const engine = getLLMExecutionEngine();

    const params: LLMIntentParams = {
      prompt,
      systemPrompt,
      models,
      modelTier,
      minModels,
      maxModels,
      maxTokens,
      temperature,
      compareBy,
      selectionMode,
    };

    console.log(`[API] Starting LLM comparison for intent ${intentId}`);

    const result = await engine.executeComparison(intentId, params);

    // If agent provided, record credit usage
    if (agentId) {
      const scorer = getAgentCreditScorer();
      try {
        const profile = await scorer.getOrCreateProfile(agentId, req.body.address || 'unknown');

        // Try to use credit if available
        if (result.totalCost <= profile.availableCredit) {
          await scorer.recordCreditUse(agentId, result.totalCost, intentId);
          console.log(`[API] Charged ${result.totalCost} to agent ${agentId} credit`);
        }
      } catch (error) {
        console.warn(`[API] Failed to record credit usage:`, error);
      }
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[API] LLM comparison error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'COMPARISON_ERROR',
        message: error instanceof Error ? error.message : 'Failed to execute comparison',
      },
    });
  }
});

/**
 * POST /api/llm/compare/:intentId/select
 * Select a model result from comparison
 */
router.post('/compare/:intentId/select', async (req: Request, res: Response) => {
  try {
    const { intentId } = req.params;
    const { modelId, reason, agentId } = req.body;

    if (!modelId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_MODEL_ID',
          message: 'Model ID is required',
        },
      });
    }

    // TODO: Store selection in database
    // For now, just acknowledge

    res.json({
      success: true,
      data: {
        intentId,
        selectedModel: modelId,
        reason,
        selectedAt: Date.now(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SELECTION_ERROR',
        message: error instanceof Error ? error.message : 'Failed to record selection',
      },
    });
  }
});

// -------------------- STREAMING --------------------

/**
 * POST /api/llm/stream/create
 * Create a streaming payment for LLM execution
 */
router.post('/stream/create', async (req: Request, res: Response) => {
  try {
    const { intentId, modelId, agentId, address, maxBudget, costPerToken } = req.body;

    if (!intentId || !modelId || !agentId || !address) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'intentId, modelId, agentId, and address are required',
        },
      });
    }

    const controller = getStreamingPaymentController();

    const stream = await controller.createStream({
      intentId,
      modelId,
      payer: address,
      payee: process.env.SYNAPSE_PLATFORM_WALLET || 'platform',
      costPerToken: costPerToken || 0.00001,
      maxAmount: maxBudget || 1.0,
    });

    res.json({
      success: true,
      data: stream,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'STREAM_CREATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create stream',
      },
    });
  }
});

/**
 * POST /api/llm/stream/:streamId/pause
 * Pause a streaming payment
 */
router.post('/stream/:streamId/pause', async (req: Request, res: Response) => {
  try {
    const { streamId } = req.params;
    const { reason } = req.body;

    const controller = getStreamingPaymentController();
    await controller.pauseStream(streamId, reason);

    res.json({
      success: true,
      data: { streamId, paused: true, reason },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'STREAM_PAUSE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to pause stream',
      },
    });
  }
});

/**
 * POST /api/llm/stream/:streamId/resume
 * Resume a paused stream
 */
router.post('/stream/:streamId/resume', async (req: Request, res: Response) => {
  try {
    const { streamId } = req.params;

    const controller = getStreamingPaymentController();
    await controller.resumeStream(streamId);

    res.json({
      success: true,
      data: { streamId, resumed: true },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'STREAM_RESUME_ERROR',
        message: error instanceof Error ? error.message : 'Failed to resume stream',
      },
    });
  }
});

/**
 * GET /api/llm/stream/stats
 * Get streaming payment statistics
 */
router.get('/stream/stats', async (req: Request, res: Response) => {
  try {
    const controller = getStreamingPaymentController();
    const stats = controller.getStreamStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'STREAM_STATS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get stream stats',
      },
    });
  }
});

// -------------------- CREDIT SCORES --------------------

/**
 * GET /api/llm/credit/:agentId
 * Get agent credit profile
 */
router.get('/credit/:agentId', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;

    const scorer = getAgentCreditScorer();
    const profile = await scorer.getProfile(agentId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PROFILE_NOT_FOUND',
          message: 'Credit profile not found',
        },
      });
    }

    res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CREDIT_FETCH_ERROR',
        message: error instanceof Error ? error.message : 'Failed to fetch credit profile',
      },
    });
  }
});

/**
 * POST /api/llm/credit/:agentId/create
 * Create or get credit profile
 */
router.post('/credit/:agentId/create', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_ADDRESS',
          message: 'Wallet address is required',
        },
      });
    }

    const scorer = getAgentCreditScorer();
    const profile = await scorer.getOrCreateProfile(agentId, address);

    res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PROFILE_CREATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create profile',
      },
    });
  }
});

/**
 * POST /api/llm/credit/:agentId/payment
 * Record a credit payment
 */
router.post('/credit/:agentId/payment', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { amount, onTime = true } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_AMOUNT',
          message: 'Valid payment amount is required',
        },
      });
    }

    const scorer = getAgentCreditScorer();
    await scorer.recordPayment(agentId, amount, onTime);

    const updatedProfile = await scorer.getProfile(agentId);

    res.json({
      success: true,
      data: updatedProfile,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PAYMENT_RECORD_ERROR',
        message: error instanceof Error ? error.message : 'Failed to record payment',
      },
    });
  }
});

/**
 * GET /api/llm/credit/stats
 * Get credit system statistics
 */
router.get('/credit/stats', async (req: Request, res: Response) => {
  try {
    const scorer = getAgentCreditScorer();
    const stats = scorer.getCreditStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CREDIT_STATS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get credit stats',
      },
    });
  }
});

export default router;
