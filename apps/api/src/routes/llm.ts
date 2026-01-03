// ============================================================
// SYNAPSE API - LLM COMPARISON ROUTES
// With x402 USDC Payment Integration
// ============================================================

import { Router, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import {
  getLLMExecutionEngine,
  getAgentCreditScorer,
  getStreamingPaymentController,
  getLLMIntentBridge,
  LLMIntentParams,
  LLMComparisonResult,
  LLMIntentRequest,
  CREDIT_TIER_CONFIG,
  CreditTier,
} from '@synapse/core/llm';
import {
  x402Middleware,
  x402DynamicMiddleware,
  X402Request,
} from '@synapse/core/x402';
import { IntentStatus } from '@synapse/types';

const router = Router();

// x402 Payment Configuration
const X402_CONFIG = {
  network: (process.env.X402_NETWORK || 'base-sepolia') as 'base-sepolia' | 'base',
  recipient: process.env.SYNAPSE_PLATFORM_WALLET || '0x742d35Cc6634c0532925A3b844BC9e7595F5bE21',
  demoMode: process.env.X402_DEMO_MODE === 'true',
};

// Dynamic pricing based on model tier
const LLM_PRICES = {
  premium: '0.01',    // $0.01 USDC for premium models
  standard: '0.005',  // $0.005 USDC for standard models
  budget: '0.002',    // $0.002 USDC for budget models
  all: '0.015',       // $0.015 USDC for comparing all tiers
};

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
 * GET /api/llm/pricing
 * Get LLM comparison pricing info
 */
router.get('/pricing', async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      prices: LLM_PRICES,
      currency: 'USDC',
      network: X402_CONFIG.network,
      recipient: X402_CONFIG.recipient,
      demoMode: X402_CONFIG.demoMode,
      description: 'Pay per LLM comparison request. Price varies by model tier.',
    },
  });
});

/**
 * POST /api/llm/compare
 * Execute LLM comparison across multiple models (FREE - no payment required)
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
 * POST /api/llm/compare/paid
 * Execute LLM comparison with x402 USDC payment
 * Returns 402 Payment Required if no payment header provided
 */
router.post(
  '/compare/paid',
  x402DynamicMiddleware((req) => {
    // Get tier from request body (default to 'standard')
    const tier = (req.body?.modelTier || 'standard') as keyof typeof LLM_PRICES;
    const price = LLM_PRICES[tier] || LLM_PRICES.standard;

    return {
      price,
      network: X402_CONFIG.network,
      recipient: X402_CONFIG.recipient,
      description: `LLM Comparison (${tier} tier) - ${price} USDC`,
    };
  }),
  async (req: X402Request, res: Response) => {
    try {
      const {
        prompt,
        systemPrompt,
        models,
        modelTier = 'standard',
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

      const intentId = `llm_paid_${nanoid()}`;
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

      console.log(`[API] Starting PAID LLM comparison for intent ${intentId}`);
      console.log(`[API] x402 Payment: ${req.x402Payment?.amount} USDC from ${req.x402Payment?.from}`);

      const result = await engine.executeComparison(intentId, params);

      // Add payment info to result
      const responseData = {
        ...result,
        payment: {
          method: 'x402',
          currency: 'USDC',
          amount: req.x402Payment?.amount || '0',
          from: req.x402Payment?.from,
          to: req.x402Payment?.to,
          txHash: req.x402Payment?.txHash,
          network: req.x402Payment?.network,
          verified: req.x402Payment?.verified,
        },
      };

      res.json({
        success: true,
        data: responseData,
      });
    } catch (error) {
      console.error('[API] Paid LLM comparison error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'COMPARISON_ERROR',
          message: error instanceof Error ? error.message : 'Failed to execute comparison',
        },
      });
    }
  }
);

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
 * GET /api/llm/credit/stats
 * Get credit system statistics
 * NOTE: This must come BEFORE /credit/:agentId to avoid route conflict
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

/**
 * GET /api/llm/credit/tiers
 * Get credit tier configuration and benefits
 * NOTE: This must come BEFORE /credit/:agentId to avoid route conflict
 */
router.get('/credit/tiers', async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: {
        tiers: CREDIT_TIER_CONFIG,
        benefits: {
          exceptional: {
            scoreRange: '800-850',
            discount: '20% off all LLM costs',
            creditLimit: '$10,000 unsecured credit line',
            escrowRequired: '0% - no escrow needed',
          },
          excellent: {
            scoreRange: '740-799',
            discount: '15% off all LLM costs',
            creditLimit: '$5,000 unsecured credit line',
            escrowRequired: '25% escrow on large transactions',
          },
          good: {
            scoreRange: '670-739',
            discount: '10% off all LLM costs',
            creditLimit: '$1,000 unsecured credit line',
            escrowRequired: '50% escrow on large transactions',
          },
          fair: {
            scoreRange: '580-669',
            discount: 'Standard pricing (0% discount)',
            creditLimit: '$200 unsecured credit line',
            escrowRequired: '100% escrow required',
          },
          subprime: {
            scoreRange: '300-579',
            discount: '10% PREMIUM on all LLM costs',
            creditLimit: '$0 - prepayment only',
            escrowRequired: '100% escrow required',
          },
        },
        howToImprove: [
          'Make on-time payments to increase payment history score',
          'Keep credit utilization below 30% for optimal scoring',
          'Maintain account age by using the platform regularly',
          'Diversify transaction types (LLM, MCP tools, etc.)',
          'Add collateral/stake to boost credit limit',
        ],
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CREDIT_TIERS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get credit tiers',
      },
    });
  }
});

/**
 * GET /api/llm/credit/:agentId/detailed
 * Get detailed credit profile with factor breakdown and next tier info
 */
router.get('/credit/:agentId/detailed', async (req: Request, res: Response) => {
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

    // Calculate factor ratings
    const getRating = (score: number): string => {
      if (score >= 90) return 'excellent';
      if (score >= 70) return 'good';
      if (score >= 50) return 'fair';
      return 'poor';
    };

    // Find next tier
    const tierOrder: CreditTier[] = ['subprime', 'fair', 'good', 'excellent', 'exceptional'];
    const currentTierIndex = tierOrder.indexOf(profile.creditTier as CreditTier);
    const nextTierName = currentTierIndex < tierOrder.length - 1 ? tierOrder[currentTierIndex + 1] : null;
    const nextTierConfig = nextTierName ? CREDIT_TIER_CONFIG[nextTierName] : null;
    const pointsToNextTier = nextTierConfig ? nextTierConfig.minScore - profile.creditScore : 0;

    res.json({
      success: true,
      data: {
        score: profile.creditScore,
        tier: profile.creditTier,
        tierConfig: {
          discount: profile.tierDiscount,
          creditLimit: profile.unsecuredCreditLimit,
          escrowRequired: CREDIT_TIER_CONFIG[profile.creditTier as CreditTier].escrowRequired,
        },
        nextTier: nextTierName ? {
          name: nextTierName,
          pointsNeeded: pointsToNextTier,
          discount: nextTierConfig!.rateDiscount,
          minScore: nextTierConfig!.minScore,
        } : null,
        factors: {
          paymentHistory: {
            score: profile.factors.paymentHistory,
            rating: getRating(profile.factors.paymentHistory),
            weight: 0.35,
            description: 'On-time payment history',
          },
          creditUtilization: {
            score: profile.factors.creditUtilization,
            rating: getRating(profile.factors.creditUtilization),
            weight: 0.30,
            description: 'Credit usage vs. limit',
          },
          accountAge: {
            score: profile.factors.accountAge,
            rating: getRating(profile.factors.accountAge),
            weight: 0.15,
            description: 'Time since first activity',
          },
          creditMix: {
            score: profile.factors.creditMix,
            rating: getRating(profile.factors.creditMix),
            weight: 0.10,
            description: 'Variety of transactions',
          },
          recentActivity: {
            score: profile.factors.recentActivity,
            rating: getRating(profile.factors.recentActivity),
            weight: 0.10,
            description: 'Recent payment patterns',
          },
        },
        balances: {
          currentBalance: profile.currentBalance,
          availableCredit: profile.availableCredit,
          dailySpend: profile.currentDailySpend,
          monthlySpend: profile.currentMonthlySpend,
          dailyLimit: profile.dailySpendLimit,
          monthlyLimit: profile.monthlySpendLimit,
        },
        stats: {
          totalTransactions: profile.totalTransactions,
          successfulPayments: profile.successfulPayments,
          latePayments: profile.latePayments,
          defaults: profile.defaults,
          accountAgeDays: profile.accountAge,
        },
        collateral: {
          stakedAmount: profile.stakedAmount,
          collateralRatio: profile.collateralRatio,
        },
        lastUpdated: profile.lastScoreUpdate,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CREDIT_DETAILED_ERROR',
        message: error instanceof Error ? error.message : 'Failed to fetch detailed credit profile',
      },
    });
  }
});

/**
 * POST /api/llm/credit/:agentId/simulate
 * Simulate a payment and show projected score change
 */
router.post('/credit/:agentId/simulate', async (req: Request, res: Response) => {
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

    // Clone profile for simulation
    const simProfile = { ...profile, factors: { ...profile.factors } };

    // Simulate payment effects
    simProfile.currentBalance = Math.max(0, simProfile.currentBalance - amount);
    simProfile.successfulPayments = onTime ? simProfile.successfulPayments + 1 : simProfile.successfulPayments;
    simProfile.latePayments = !onTime ? simProfile.latePayments + 1 : simProfile.latePayments;

    // Recalculate payment history factor
    if (simProfile.totalTransactions > 0) {
      const successRate = simProfile.successfulPayments / (simProfile.totalTransactions + 1);
      const lateRate = simProfile.latePayments / (simProfile.totalTransactions + 1);
      simProfile.factors.paymentHistory = Math.max(0, Math.min(100, 100 - lateRate * 30));
    }

    // Recalculate utilization
    if (simProfile.unsecuredCreditLimit > 0) {
      const utilization = simProfile.currentBalance / simProfile.unsecuredCreditLimit;
      if (utilization < 0.10) simProfile.factors.creditUtilization = 100;
      else if (utilization < 0.30) simProfile.factors.creditUtilization = 80;
      else if (utilization < 0.50) simProfile.factors.creditUtilization = 60;
      else if (utilization < 0.75) simProfile.factors.creditUtilization = 40;
      else simProfile.factors.creditUtilization = 20;
    }

    // Calculate projected score
    const weights = {
      paymentHistory: 0.35,
      creditUtilization: 0.30,
      accountAge: 0.15,
      creditMix: 0.10,
      recentActivity: 0.10,
    };

    const rawScore =
      simProfile.factors.paymentHistory * weights.paymentHistory +
      simProfile.factors.creditUtilization * weights.creditUtilization +
      simProfile.factors.accountAge * weights.accountAge +
      simProfile.factors.creditMix * weights.creditMix +
      simProfile.factors.recentActivity * weights.recentActivity;

    const projectedScore = Math.max(300, Math.min(850, Math.round(300 + (rawScore * 5.5))));

    // Check if tier would change
    const tierOrder: CreditTier[] = ['subprime', 'fair', 'good', 'excellent', 'exceptional'];
    const getTier = (score: number): CreditTier => {
      if (score >= 800) return 'exceptional';
      if (score >= 740) return 'excellent';
      if (score >= 670) return 'good';
      if (score >= 580) return 'fair';
      return 'subprime';
    };

    const projectedTier = getTier(projectedScore);
    const tierChange = projectedTier !== profile.creditTier ? projectedTier : null;

    res.json({
      success: true,
      data: {
        currentScore: profile.creditScore,
        projectedScore,
        scoreDelta: projectedScore - profile.creditScore,
        currentTier: profile.creditTier,
        projectedTier,
        tierChange,
        projectedDiscount: tierChange ? CREDIT_TIER_CONFIG[tierChange].rateDiscount : profile.tierDiscount,
        paymentAmount: amount,
        onTime,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SIMULATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to simulate payment',
      },
    });
  }
});

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
    const { amount, onTime = true, txHash, blockNumber } = req.body;

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
    await scorer.recordPayment(agentId, amount, onTime, txHash, blockNumber);

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

// -------------------- INTENT-BASED LLM COMPARISON --------------------
// These routes implement LLMs as competing bidders where users can select

/**
 * POST /api/llm/intent/create
 * Create an LLM comparison intent - starts bidding process
 */
router.post('/intent/create', async (req: Request, res: Response) => {
  try {
    const {
      prompt,
      systemPrompt,
      maxTokens = 500,
      temperature = 0.7,
      modelTier = 'all',
      maxBudget = 0.05, // Default $0.05 USDC
      clientAddress,
      biddingDuration = 30000, // 30 seconds
    } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PROMPT', message: 'Prompt is required' },
      });
    }

    if (!clientAddress) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ADDRESS', message: 'Client address is required' },
      });
    }

    const bridge = getLLMIntentBridge();
    const engine = getLLMExecutionEngine();

    // Create the intent
    const intent = await bridge.createLLMIntent({
      prompt,
      systemPrompt,
      maxTokens,
      temperature,
      modelTier,
      maxBudget,
      clientAddress,
      biddingDuration,
    });

    console.log(`[API] Created LLM intent ${intent.id} for ${clientAddress}`);

    // Start collecting bids from LLM providers in parallel
    // Each LLM model will "bid" by generating a response
    const params: LLMIntentParams = {
      prompt,
      systemPrompt,
      modelTier,
      maxTokens,
      temperature,
      compareBy: ['cost', 'quality', 'latency'],
      selectionMode: 'manual',
    };

    // Execute comparison to get all LLM responses as "bids"
    const comparisonResult = await engine.executeComparison(intent.id, params);

    // Load credit profile for the agent (if agentId provided)
    let creditProfile = null;
    const agentId = req.body.agentId || clientAddress;
    if (agentId) {
      try {
        const scorer = getAgentCreditScorer();
        creditProfile = await scorer.getOrCreateProfile(agentId, clientAddress);
        console.log(`[API] Loaded credit profile for ${agentId}: tier=${creditProfile.creditTier}, discount=${creditProfile.tierDiscount * 100}%`);
      } catch (error) {
        console.warn(`[API] Failed to load credit profile:`, error);
      }
    }

    // Submit each LLM response as a bid (with credit profile for discounting)
    for (const result of comparisonResult.results) {
      bridge.submitLLMBid(
        intent.id,
        result.modelId,
        result.provider,
        result.response,
        {
          input: result.tokenUsage.inputTokens,
          output: result.tokenUsage.outputTokens,
          total: result.tokenUsage.totalTokens,
        },
        result.latencyMs,
        result.cost,
        result.qualityScore || 7.5, // Default quality score if not set
        creditProfile || undefined
      );
    }

    // Apply credit profile to intent (for response)
    if (creditProfile) {
      bridge.applyCreditProfile(intent.id, creditProfile);
    }

    // Get the updated intent with all bids
    const intentResult = bridge.getIntentResult(intent.id);

    // Get credit info from intent
    const updatedIntent = bridge.getIntent(intent.id);

    res.json({
      success: true,
      data: {
        intent: {
          id: intent.id,
          status: intent.status,
          biddingDeadline: intent.biddingDeadline,
          maxBudget: intent.maxBudget,
        },
        bids: intentResult?.llmBids || [],
        comparison: intentResult?.comparison,
        pricing: {
          selectionCost: LLM_PRICES.standard, // Cost to select a model
          currency: 'USDC',
          network: X402_CONFIG.network,
        },
        // Credit info (if available)
        creditInfo: updatedIntent?.creditInfo || null,
      },
    });
  } catch (error) {
    console.error('[API] Intent creation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTENT_CREATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create intent',
      },
    });
  }
});

/**
 * GET /api/llm/intent/:intentId
 * Get intent status and all bids
 */
router.get('/intent/:intentId', async (req: Request, res: Response) => {
  try {
    const { intentId } = req.params;

    const bridge = getLLMIntentBridge();
    const intent = bridge.getIntent(intentId);

    if (!intent) {
      return res.status(404).json({
        success: false,
        error: { code: 'INTENT_NOT_FOUND', message: 'Intent not found' },
      });
    }

    const intentResult = bridge.getIntentResult(intentId);

    res.json({
      success: true,
      data: {
        intent: {
          id: intent.id,
          status: intent.status,
          biddingDeadline: intent.biddingDeadline,
          executionDeadline: intent.executionDeadline,
          maxBudget: intent.maxBudget,
          selectedModelId: intent.selectedModelId,
          paymentTxHash: intent.paymentTxHash,
          prompt: intent.params.prompt,
        },
        bids: intentResult?.llmBids || [],
        comparison: intentResult?.comparison,
        userCanSelect: intentResult?.userCanSelect,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTENT_FETCH_ERROR',
        message: error instanceof Error ? error.message : 'Failed to fetch intent',
      },
    });
  }
});

/**
 * POST /api/llm/intent/:intentId/select
 * User selects their preferred model - triggers x402 payment
 */
router.post('/intent/:intentId/select', async (req: Request, res: Response) => {
  try {
    const { intentId } = req.params;
    const { modelId, paymentTxHash, clientAddress } = req.body;

    if (!modelId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_MODEL_ID', message: 'Model ID is required' },
      });
    }

    const bridge = getLLMIntentBridge();
    const intent = bridge.getIntent(intentId);

    if (!intent) {
      return res.status(404).json({
        success: false,
        error: { code: 'INTENT_NOT_FOUND', message: 'Intent not found' },
      });
    }

    // Verify client address matches
    if (clientAddress && intent.clientAddress !== clientAddress) {
      return res.status(403).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authorized to select for this intent' },
      });
    }

    // Select the model
    const result = await bridge.selectModel(intentId, modelId, paymentTxHash);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'SELECTION_FAILED', message: result.error },
      });
    }

    // Get the selected bid details
    const selectedBid = result.bid;

    console.log(`[API] Model ${modelId} selected for intent ${intentId}, payment: ${paymentTxHash}`);

    res.json({
      success: true,
      data: {
        intentId,
        selectedModel: modelId,
        response: selectedBid?.response,
        cost: selectedBid?.cost,
        latency: selectedBid?.latency,
        qualityScore: selectedBid?.qualityScore,
        tokenCount: selectedBid?.tokenCount,
        paymentTxHash,
        completedAt: Date.now(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SELECTION_ERROR',
        message: error instanceof Error ? error.message : 'Failed to select model',
      },
    });
  }
});

/**
 * POST /api/llm/intent/:intentId/payment
 * Record x402 payment for a selection
 */
router.post('/intent/:intentId/payment', async (req: Request, res: Response) => {
  try {
    const { intentId } = req.params;
    const { txHash, amount } = req.body;

    if (!txHash || !amount) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PAYMENT_INFO', message: 'txHash and amount are required' },
      });
    }

    const bridge = getLLMIntentBridge();
    const success = bridge.recordPayment(intentId, txHash, parseFloat(amount));

    if (!success) {
      return res.status(404).json({
        success: false,
        error: { code: 'INTENT_NOT_FOUND', message: 'Intent not found' },
      });
    }

    res.json({
      success: true,
      data: {
        intentId,
        txHash,
        amount,
        recordedAt: Date.now(),
      },
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
 * GET /api/llm/intent/list/:clientAddress
 * Get all intents for a client
 */
router.get('/intent/list/:clientAddress', async (req: Request, res: Response) => {
  try {
    const { clientAddress } = req.params;

    const bridge = getLLMIntentBridge();
    const intents = bridge.getIntentsByClient(clientAddress);

    res.json({
      success: true,
      data: intents.map(intent => ({
        id: intent.id,
        status: intent.status,
        prompt: intent.params.prompt.substring(0, 100) + '...',
        bidsCount: intent.llmBids.length,
        selectedModelId: intent.selectedModelId,
        createdAt: intent.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'LIST_ERROR',
        message: error instanceof Error ? error.message : 'Failed to list intents',
      },
    });
  }
});

/**
 * GET /api/llm/providers/available
 * Get list of available LLM providers and their info
 */
router.get('/providers/available', async (req: Request, res: Response) => {
  try {
    const bridge = getLLMIntentBridge();
    const providers = bridge.getProviders();

    res.json({
      success: true,
      data: providers.map(p => ({
        id: p.id,
        name: p.name,
        models: p.models,
        reputationScore: p.reputationScore,
        teeAttested: p.teeAttested,
        avgResponseTime: p.avgResponseTime,
        pricePerToken: p.pricePerToken,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PROVIDERS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get providers',
      },
    });
  }
});

export default router;
