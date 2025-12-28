// ============================================================
// SYNAPSE API - Intent Decomposition Routes
// ============================================================

import { Router, Express, Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { z } from 'zod';
import {
  IntentDecomposer,
  getIntentDecomposer,
  IntentCategory,
  ApiResponse,
  DecompositionPlan,
  SubIntent
} from '@synapse/core';

const DecomposeIntentSchema = z.object({
  type: z.string().min(1),
  category: z.nativeEnum(IntentCategory).optional(),
  params: z.record(z.unknown()),
  maxBudget: z.number().positive()
});

export function setupDecompositionRoutes(
  app: Express,
  io: SocketIOServer
): void {
  const router = Router();
  const decomposer = getIntentDecomposer();

  // -------------------- CHECK IF SHOULD DECOMPOSE --------------------
  router.post('/check', async (req: Request, res: Response) => {
    try {
      const validation = DecomposeIntentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: validation.error.errors
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      const shouldDecompose = decomposer.shouldDecompose(validation.data);

      res.json({
        success: true,
        data: { shouldDecompose },
        timestamp: Date.now()
      } as ApiResponse<{ shouldDecompose: boolean }>);
    } catch (error) {
      console.error('Error checking decomposition:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CHECK_DECOMPOSITION_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check decomposition'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- DECOMPOSE INTENT --------------------
  router.post('/decompose', async (req: Request, res: Response) => {
    try {
      const validation = DecomposeIntentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: validation.error.errors
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      const plan = decomposer.decompose(validation.data);

      // Broadcast plan creation
      io.emit('decomposition:created', {
        plan,
        timestamp: Date.now()
      });

      res.status(201).json({
        success: true,
        data: plan,
        timestamp: Date.now()
      } as ApiResponse<DecompositionPlan>);
    } catch (error) {
      console.error('Error decomposing intent:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DECOMPOSE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to decompose intent'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- GET PLAN --------------------
  router.get('/plans/:planId', async (req: Request, res: Response) => {
    try {
      const { planId } = req.params;
      const plan = decomposer.getPlan(planId);

      if (!plan) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PLAN_NOT_FOUND',
            message: `Plan ${planId} not found`
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      res.json({
        success: true,
        data: plan,
        timestamp: Date.now()
      } as ApiResponse<DecompositionPlan>);
    } catch (error) {
      console.error('Error getting plan:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_PLAN_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get plan'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- START PLAN EXECUTION --------------------
  router.post('/plans/:planId/start', async (req: Request, res: Response) => {
    try {
      const { planId } = req.params;
      const readySubIntents = decomposer.startPlan(planId);
      const plan = decomposer.getPlan(planId);

      // Broadcast ready sub-intents
      readySubIntents.forEach(subIntent => {
        io.emit('subintent:ready', {
          planId,
          subIntent,
          timestamp: Date.now()
        });
      });

      res.json({
        success: true,
        data: {
          plan,
          readySubIntents
        },
        timestamp: Date.now()
      } as ApiResponse<{ plan: DecompositionPlan | undefined; readySubIntents: SubIntent[] }>);
    } catch (error) {
      console.error('Error starting plan:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'START_PLAN_ERROR',
          message: error instanceof Error ? error.message : 'Failed to start plan'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- COMPLETE SUB-INTENT --------------------
  router.post('/plans/:planId/subintents/:subIntentId/complete', async (req: Request, res: Response) => {
    try {
      const { planId, subIntentId } = req.params;
      const { result } = req.body;

      const nextSubIntents = decomposer.completeSubIntent(planId, subIntentId, result);
      const plan = decomposer.getPlan(planId);

      // Broadcast completion
      io.emit('subintent:completed', {
        planId,
        subIntentId,
        result,
        timestamp: Date.now()
      });

      // Broadcast next ready sub-intents
      nextSubIntents.forEach(subIntent => {
        io.emit('subintent:ready', {
          planId,
          subIntent,
          timestamp: Date.now()
        });
      });

      res.json({
        success: true,
        data: {
          plan,
          nextSubIntents
        },
        timestamp: Date.now()
      } as ApiResponse<{ plan: DecompositionPlan | undefined; nextSubIntents: SubIntent[] }>);
    } catch (error) {
      console.error('Error completing sub-intent:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'COMPLETE_SUBINTENT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to complete sub-intent'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- FAIL SUB-INTENT --------------------
  router.post('/plans/:planId/subintents/:subIntentId/fail', async (req: Request, res: Response) => {
    try {
      const { planId, subIntentId } = req.params;
      const { error: errorMessage } = req.body;

      decomposer.failSubIntent(planId, subIntentId, errorMessage || 'Unknown error');
      const plan = decomposer.getPlan(planId);

      // Broadcast failure
      io.emit('subintent:failed', {
        planId,
        subIntentId,
        error: errorMessage,
        timestamp: Date.now()
      });

      res.json({
        success: true,
        data: plan,
        timestamp: Date.now()
      } as ApiResponse<DecompositionPlan | undefined>);
    } catch (error) {
      console.error('Error failing sub-intent:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FAIL_SUBINTENT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fail sub-intent'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- SIMPLE DECOMPOSE (Natural Language) --------------------
  // Easier endpoint for the MCP page - just pass an intent string
  router.post('/simple', async (req: Request, res: Response) => {
    try {
      const { intent } = req.body;

      if (!intent || typeof intent !== 'string') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'intent string is required'
          },
          timestamp: Date.now()
        });
      }

      // Parse natural language intent into structured format
      const parsed = parseNaturalIntent(intent);

      const plan = decomposer.decompose(parsed);

      // Add tool pricing estimates
      const enrichedSubIntents = plan.subIntents.map(si => ({
        ...si,
        estimatedCost: getToolPrice(si.type),
        toolName: si.type
      }));

      res.json({
        success: true,
        data: {
          planId: plan.id,
          originalIntent: intent,
          parsedAs: parsed.type,
          subIntents: enrichedSubIntents,
          executionPlan: {
            batches: plan.executionOrder.map((batch, i) => ({
              batchNumber: i + 1,
              parallel: batch.length > 1,
              intents: batch.map(id => enrichedSubIntents.find(si => si.id === id))
            }))
          },
          totalEstimatedCost: enrichedSubIntents.reduce((sum, si) => sum + (si.estimatedCost || 0), 0),
          estimatedTimeMs: plan.estimatedTime
        },
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error in simple decompose:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DECOMPOSE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to decompose intent'
        },
        timestamp: Date.now()
      });
    }
  });

  // Mount router
  app.use('/api/decomposition', router);
}

// Helper: Parse natural language intent
function parseNaturalIntent(intent: string): {
  type: string;
  category: IntentCategory;
  params: Record<string, unknown>;
  maxBudget: number;
} {
  const lower = intent.toLowerCase();

  // Check for crypto patterns
  const cryptoMatch = lower.match(/(?:get|fetch|show)\s+(?:the\s+)?(?:price(?:s)?|value(?:s)?)\s+(?:of|for)?\s*([\w,\s]+?)(?:\s+and|\s+with|\s*$)/i);
  const cryptoSymbols = extractCryptoSymbols(intent);

  // Check for weather patterns
  const weatherMatch = lower.match(/weather\s+(?:in|for|at)\s+([a-zA-Z\s,]+)/i);
  const cities = weatherMatch ? weatherMatch[1].split(/,|\s+and\s+/).map(c => c.trim()).filter(Boolean) : [];

  // Check for news patterns
  const newsMatch = lower.match(/(?:latest|recent|top|get)\s+(?:crypto|cryptocurrency|blockchain|tech|technology)?\s*news/i);

  // Determine intent type based on patterns
  if (cryptoSymbols.length > 1 || (cryptoSymbols.length === 1 && (lower.includes('news') || cities.length > 0))) {
    // Multi-type intent
    const types: string[] = [];
    const params: Record<string, unknown> = {};

    if (cryptoSymbols.length > 0) {
      types.push('crypto.prices');
      params.symbols = cryptoSymbols;
    }

    if (cities.length > 0) {
      types.push('weather.multi');
      params.cities = cities;
    }

    if (newsMatch || lower.includes('news')) {
      types.push('news.latest');
      params.topic = lower.includes('crypto') ? 'cryptocurrency' : 'technology';
    }

    return {
      type: types.length > 1 ? types.join('+') : types[0] || 'unknown',
      category: IntentCategory.DATA,
      params,
      maxBudget: types.length * 0.02
    };
  }

  // Dashboard pattern
  if (lower.includes('dashboard') || (cryptoSymbols.length > 0 && lower.includes('news'))) {
    return {
      type: 'dashboard.crypto',
      category: IntentCategory.DATA,
      params: { symbols: cryptoSymbols.length > 0 ? cryptoSymbols : ['BTC', 'ETH'] },
      maxBudget: 0.05
    };
  }

  // Single crypto
  if (cryptoSymbols.length === 1) {
    return {
      type: 'crypto.price',
      category: IntentCategory.DATA,
      params: { symbol: cryptoSymbols[0] },
      maxBudget: 0.01
    };
  }

  // Weather
  if (cities.length > 0) {
    return {
      type: cities.length > 1 ? 'weather.multi' : 'weather.current',
      category: IntentCategory.DATA,
      params: cities.length > 1 ? { cities } : { city: cities[0] },
      maxBudget: cities.length * 0.01
    };
  }

  // News
  if (newsMatch) {
    return {
      type: 'news.latest',
      category: IntentCategory.DATA,
      params: { topic: lower.includes('crypto') ? 'cryptocurrency' : 'technology' },
      maxBudget: 0.01
    };
  }

  // Default fallback
  return {
    type: 'unknown',
    category: IntentCategory.DATA,
    params: { raw: intent },
    maxBudget: 0.01
  };
}

// Helper: Extract crypto symbols from text
function extractCryptoSymbols(text: string): string[] {
  const knownSymbols = ['BTC', 'ETH', 'SOL', 'USDC', 'USDT', 'XRP', 'ADA', 'DOT', 'DOGE', 'LINK', 'AVAX', 'MATIC', 'UNI', 'ATOM', 'LTC'];
  const found: string[] = [];

  // Check for explicit symbols
  for (const symbol of knownSymbols) {
    if (text.toUpperCase().includes(symbol)) {
      found.push(symbol);
    }
  }

  // Check for full names
  const nameToSymbol: Record<string, string> = {
    'bitcoin': 'BTC',
    'ethereum': 'ETH',
    'solana': 'SOL',
    'ripple': 'XRP',
    'cardano': 'ADA',
    'polkadot': 'DOT',
    'dogecoin': 'DOGE',
    'chainlink': 'LINK',
    'avalanche': 'AVAX',
    'polygon': 'MATIC',
    'uniswap': 'UNI',
    'cosmos': 'ATOM',
    'litecoin': 'LTC'
  };

  const lower = text.toLowerCase();
  for (const [name, symbol] of Object.entries(nameToSymbol)) {
    if (lower.includes(name) && !found.includes(symbol)) {
      found.push(symbol);
    }
  }

  return found;
}

// Helper: Get tool price
function getToolPrice(toolType: string): number {
  const prices: Record<string, number> = {
    'weather.current': 0.005,
    'weather.multi': 0.005,
    'crypto.price': 0.003,
    'crypto.prices': 0.003,
    'news.latest': 0.005,
    'news.search': 0.005,
    'dashboard.crypto': 0.015,
    'dashboard.portfolio': 0.015,
    'dashboard.market': 0.015
  };
  return prices[toolType] || 0.01;
}
