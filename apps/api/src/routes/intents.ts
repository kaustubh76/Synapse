// ============================================================
// SYNAPSE API - Intent Routes
// ============================================================

import { Router, Express, Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { z } from 'zod';
import {
  IntentEngine,
  CreateIntentRequest,
  IntentCategory,
  BidSubmission,
  WSEventType,
  ApiResponse,
  Intent,
  Bid
} from '@synapse/core';

// Validation schemas
const CreateIntentSchema = z.object({
  type: z.string().min(1),
  category: z.nativeEnum(IntentCategory),
  params: z.record(z.unknown()),
  maxBudget: z.number().positive(),
  currency: z.string().default('USDC'),
  requirements: z.object({
    minReputation: z.number().min(0).max(5).optional(),
    requireTEE: z.boolean().optional(),
    preferredProviders: z.array(z.string()).optional(),
    excludedProviders: z.array(z.string()).optional(),
    maxLatency: z.number().positive().optional()
  }).optional(),
  biddingDuration: z.number().positive().optional(),
  executionTimeout: z.number().positive().optional()
});

const SubmitBidSchema = z.object({
  bidAmount: z.number().positive(),
  estimatedTime: z.number().positive(),
  confidence: z.number().min(0).max(100),
  providerAddress: z.string().min(1),
  providerId: z.string().min(1),
  reputationScore: z.number().min(0).max(5),
  teeAttested: z.boolean().default(false),
  capabilities: z.array(z.string())
});

const SubmitResultSchema = z.object({
  data: z.unknown(),
  providerId: z.string(),
  executionTime: z.number(),
  proof: z.string().optional(),
  attestation: z.string().optional()
});

export function setupIntentRoutes(
  app: Express,
  intentEngine: IntentEngine,
  io: SocketIOServer
): void {
  const router = Router();

  // -------------------- CREATE INTENT --------------------
  router.post('/', async (req: Request, res: Response) => {
    try {
      const validation = CreateIntentSchema.safeParse(req.body);
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

      // Get client address from header or body
      const clientAddress = req.headers['x-client-address'] as string ||
                           req.body.clientAddress ||
                           '0xDemoClient';

      const intent = intentEngine.createIntent(
        validation.data as CreateIntentRequest,
        clientAddress
      );

      // Broadcast to all connected providers
      io.emit(WSEventType.NEW_INTENT_AVAILABLE, {
        intent,
        timestamp: Date.now()
      });

      res.status(201).json({
        success: true,
        data: intent,
        timestamp: Date.now()
      } as ApiResponse<Intent>);
    } catch (error) {
      console.error('Error creating intent:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CREATE_INTENT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create intent'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- LIST INTENTS --------------------
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { status, client, provider, type } = req.query;

      let intents: Intent[] = [];

      if (client) {
        intents = intentEngine.getIntentsByClient(client as string);
      } else if (provider) {
        intents = intentEngine.getIntentsByProvider(provider as string);
      } else if (status === 'open') {
        intents = intentEngine.getOpenIntents();
      } else if (type) {
        intents = intentEngine.getOpenIntentsByType(type as string);
      } else {
        // Get all intents (for demo purposes)
        intents = intentEngine.getOpenIntents();
      }

      res.json({
        success: true,
        data: intents,
        timestamp: Date.now()
      } as ApiResponse<Intent[]>);
    } catch (error) {
      console.error('Error listing intents:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'LIST_INTENTS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to list intents'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- GET INTENT --------------------
  router.get('/:intentId', async (req: Request, res: Response) => {
    try {
      const { intentId } = req.params;
      const intent = intentEngine.getIntent(intentId);

      if (!intent) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'INTENT_NOT_FOUND',
            message: `Intent ${intentId} not found`
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      const bids = intentEngine.getBidsForIntent(intentId);

      res.json({
        success: true,
        data: { intent, bids },
        timestamp: Date.now()
      } as ApiResponse<{ intent: Intent; bids: Bid[] }>);
    } catch (error) {
      console.error('Error getting intent:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_INTENT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get intent'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- GET INTENT BIDS --------------------
  router.get('/:intentId/bids', async (req: Request, res: Response) => {
    try {
      const { intentId } = req.params;
      const intent = intentEngine.getIntent(intentId);

      if (!intent) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'INTENT_NOT_FOUND',
            message: `Intent ${intentId} not found`
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      const bids = intentEngine.getBidsForIntent(intentId);

      res.json({
        success: true,
        data: bids,
        timestamp: Date.now()
      } as ApiResponse<Bid[]>);
    } catch (error) {
      console.error('Error getting bids:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_BIDS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get bids'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- SUBMIT BID --------------------
  router.post('/:intentId/bid', async (req: Request, res: Response) => {
    try {
      const { intentId } = req.params;
      const validation = SubmitBidSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid bid data',
            details: validation.error.errors
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      const intent = intentEngine.getIntent(intentId);
      if (!intent) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'INTENT_NOT_FOUND',
            message: `Intent ${intentId} not found`
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      const bidData = validation.data;
      const submission: BidSubmission = {
        intentId,
        bidAmount: bidData.bidAmount,
        estimatedTime: bidData.estimatedTime,
        confidence: bidData.confidence
      };

      const bid = intentEngine.submitBid(submission, {
        address: bidData.providerAddress,
        id: bidData.providerId,
        reputationScore: bidData.reputationScore,
        teeAttested: bidData.teeAttested,
        capabilities: bidData.capabilities
      });

      if (!bid) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'BID_REJECTED',
            message: 'Bid was rejected - check intent status and requirements'
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      res.status(201).json({
        success: true,
        data: bid,
        timestamp: Date.now()
      } as ApiResponse<Bid>);
    } catch (error) {
      console.error('Error submitting bid:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SUBMIT_BID_ERROR',
          message: error instanceof Error ? error.message : 'Failed to submit bid'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- SUBMIT RESULT --------------------
  router.post('/:intentId/result', async (req: Request, res: Response) => {
    try {
      const { intentId } = req.params;
      const validation = SubmitResultSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid result data',
            details: validation.error.errors
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      const intent = intentEngine.getIntent(intentId);
      if (!intent) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'INTENT_NOT_FOUND',
            message: `Intent ${intentId} not found`
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      const resultData = validation.data;
      const success = intentEngine.submitResult(intentId, {
        data: resultData.data,
        providerId: resultData.providerId,
        executionTime: resultData.executionTime,
        proof: resultData.proof,
        attestation: resultData.attestation,
        settledAmount: 0 // Will be updated by payment
      });

      if (!success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'RESULT_REJECTED',
            message: 'Result was rejected - check provider assignment'
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      const updatedIntent = intentEngine.getIntent(intentId);

      res.json({
        success: true,
        data: updatedIntent,
        timestamp: Date.now()
      } as ApiResponse<Intent>);
    } catch (error) {
      console.error('Error submitting result:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SUBMIT_RESULT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to submit result'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- CANCEL INTENT --------------------
  router.post('/:intentId/cancel', async (req: Request, res: Response) => {
    try {
      const { intentId } = req.params;
      const clientAddress = req.headers['x-client-address'] as string ||
                           req.body.clientAddress;

      if (!clientAddress) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_CLIENT_ADDRESS',
            message: 'Client address required'
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      const success = intentEngine.cancelIntent(intentId, clientAddress);

      if (!success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'CANCEL_FAILED',
            message: 'Cannot cancel intent - check ownership and status'
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      res.json({
        success: true,
        data: { cancelled: true, intentId },
        timestamp: Date.now()
      } as ApiResponse<{ cancelled: boolean; intentId: string }>);
    } catch (error) {
      console.error('Error cancelling intent:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CANCEL_INTENT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to cancel intent'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- FORCE CLOSE BIDDING (Demo) --------------------
  router.post('/:intentId/close-bidding', async (req: Request, res: Response) => {
    try {
      const { intentId } = req.params;

      intentEngine.forceCloseBidding(intentId);
      const intent = intentEngine.getIntent(intentId);

      res.json({
        success: true,
        data: intent,
        timestamp: Date.now()
      } as ApiResponse<Intent | undefined>);
    } catch (error) {
      console.error('Error closing bidding:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CLOSE_BIDDING_ERROR',
          message: error instanceof Error ? error.message : 'Failed to close bidding'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // Mount router
  app.use('/api/intents', router);
}
