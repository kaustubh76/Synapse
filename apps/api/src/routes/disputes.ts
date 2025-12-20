// ============================================================
// SYNAPSE API - Dispute Resolution Routes
// ============================================================

import { Router, Express, Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { z } from 'zod';
import {
  getDisputeResolver,
  DisputeStatus,
  DisputeReason,
  ApiResponse,
  Dispute
} from '@synapse/core';

const OpenDisputeSchema = z.object({
  intentId: z.string().min(1),
  escrowId: z.string().min(1),
  clientAddress: z.string().min(1),
  providerAddress: z.string().min(1),
  reason: z.nativeEnum(DisputeReason),
  description: z.string().min(1),
  providedValue: z.any(),
  expectedValue: z.any().optional()
});

const AddEvidenceSchema = z.object({
  submittedBy: z.enum(['client', 'provider', 'oracle']),
  type: z.enum(['execution_proof', 'reference_data', 'timing_log', 'attestation', 'other']),
  data: z.any()
});

// Type assertion helper for dispute open request
function toDisputeOpenRequest(data: z.infer<typeof OpenDisputeSchema>) {
  return {
    ...data,
    providedValue: data.providedValue ?? null
  };
}

// Type assertion helper for evidence
function toEvidenceData(data: z.infer<typeof AddEvidenceSchema>) {
  return {
    ...data,
    data: data.data ?? {}
  };
}

export function setupDisputeRoutes(
  app: Express,
  io: SocketIOServer
): void {
  const router = Router();
  const disputeResolver = getDisputeResolver();

  // Forward events to WebSocket
  disputeResolver.on('dispute:opened', (dispute) => {
    io.emit('dispute:opened', { dispute, timestamp: Date.now() });
  });

  disputeResolver.on('dispute:evidence', (dispute, evidence) => {
    io.emit('dispute:evidence', { dispute, evidence, timestamp: Date.now() });
  });

  disputeResolver.on('dispute:resolved', (dispute) => {
    io.emit('dispute:resolved', { dispute, timestamp: Date.now() });
  });

  // -------------------- OPEN DISPUTE --------------------
  router.post('/', async (req: Request, res: Response) => {
    try {
      const validation = OpenDisputeSchema.safeParse(req.body);
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

      const dispute = await disputeResolver.openDispute(toDisputeOpenRequest(validation.data));

      res.status(201).json({
        success: true,
        data: dispute,
        timestamp: Date.now()
      } as ApiResponse<Dispute>);
    } catch (error) {
      console.error('Error opening dispute:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'OPEN_DISPUTE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to open dispute'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- GET DISPUTE --------------------
  router.get('/:disputeId', async (req: Request, res: Response) => {
    try {
      const { disputeId } = req.params;
      const dispute = disputeResolver.getDispute(disputeId);

      if (!dispute) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'DISPUTE_NOT_FOUND',
            message: `Dispute ${disputeId} not found`
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      res.json({
        success: true,
        data: dispute,
        timestamp: Date.now()
      } as ApiResponse<Dispute>);
    } catch (error) {
      console.error('Error getting dispute:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_DISPUTE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get dispute'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- GET DISPUTE BY INTENT --------------------
  router.get('/intent/:intentId', async (req: Request, res: Response) => {
    try {
      const { intentId } = req.params;
      const dispute = disputeResolver.getDisputeByIntent(intentId);

      if (!dispute) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'DISPUTE_NOT_FOUND',
            message: `No dispute found for intent ${intentId}`
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      res.json({
        success: true,
        data: dispute,
        timestamp: Date.now()
      } as ApiResponse<Dispute>);
    } catch (error) {
      console.error('Error getting dispute by intent:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_DISPUTE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get dispute'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- GET CLIENT DISPUTES --------------------
  router.get('/client/:clientAddress', async (req: Request, res: Response) => {
    try {
      const { clientAddress } = req.params;
      const disputes = disputeResolver.getClientDisputes(clientAddress);

      res.json({
        success: true,
        data: {
          disputes,
          total: disputes.length
        },
        timestamp: Date.now()
      } as ApiResponse<{ disputes: Dispute[]; total: number }>);
    } catch (error) {
      console.error('Error getting client disputes:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_DISPUTES_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get disputes'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- GET PROVIDER DISPUTES --------------------
  router.get('/provider/:providerAddress', async (req: Request, res: Response) => {
    try {
      const { providerAddress } = req.params;
      const disputes = disputeResolver.getProviderDisputes(providerAddress);

      res.json({
        success: true,
        data: {
          disputes,
          total: disputes.length
        },
        timestamp: Date.now()
      } as ApiResponse<{ disputes: Dispute[]; total: number }>);
    } catch (error) {
      console.error('Error getting provider disputes:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_DISPUTES_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get disputes'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- ADD EVIDENCE --------------------
  router.post('/:disputeId/evidence', async (req: Request, res: Response) => {
    try {
      const { disputeId } = req.params;
      const validation = AddEvidenceSchema.safeParse(req.body);

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

      const evidence = disputeResolver.addEvidence(disputeId, toEvidenceData(validation.data));

      res.status(201).json({
        success: true,
        data: evidence,
        timestamp: Date.now()
      } as ApiResponse<typeof evidence>);
    } catch (error) {
      console.error('Error adding evidence:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'ADD_EVIDENCE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to add evidence'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- GET DISPUTE EVIDENCE --------------------
  router.get('/:disputeId/evidence', async (req: Request, res: Response) => {
    try {
      const { disputeId } = req.params;
      const dispute = disputeResolver.getDispute(disputeId);

      if (!dispute) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'DISPUTE_NOT_FOUND',
            message: `Dispute ${disputeId} not found`
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      res.json({
        success: true,
        data: {
          evidence: dispute.evidence,
          total: dispute.evidence.length
        },
        timestamp: Date.now()
      } as ApiResponse<{ evidence: typeof dispute.evidence; total: number }>);
    } catch (error) {
      console.error('Error getting evidence:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_EVIDENCE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get evidence'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- GET STATS --------------------
  router.get('/stats/summary', async (req: Request, res: Response) => {
    try {
      const stats = disputeResolver.getStats();

      res.json({
        success: true,
        data: stats,
        timestamp: Date.now()
      } as ApiResponse<typeof stats>);
    } catch (error) {
      console.error('Error getting dispute stats:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STATS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get dispute stats'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // Mount router
  app.use('/api/disputes', router);
}
