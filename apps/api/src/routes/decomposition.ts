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

  // Mount router
  app.use('/api/decomposition', router);
}
