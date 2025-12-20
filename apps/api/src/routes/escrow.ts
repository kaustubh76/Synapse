// ============================================================
// SYNAPSE API - Escrow Routes
// ============================================================

import { Router, Express, Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { z } from 'zod';
import {
  getEscrowManager,
  EscrowStatus,
  ApiResponse,
  Escrow
} from '@synapse/core';

const CreateEscrowSchema = z.object({
  intentId: z.string().min(1),
  clientAddress: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().optional()
});

const ReleaseEscrowSchema = z.object({
  recipientAddress: z.string().min(1),
  amount: z.number().positive(),
  reason: z.string().optional()
});

export function setupEscrowRoutes(
  app: Express,
  io: SocketIOServer
): void {
  const router = Router();
  const escrowManager = getEscrowManager();

  // -------------------- CREATE ESCROW --------------------
  router.post('/', async (req: Request, res: Response) => {
    try {
      const validation = CreateEscrowSchema.safeParse(req.body);
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

      const escrow = await escrowManager.createEscrow(validation.data);

      // Broadcast escrow creation
      io.emit('escrow:created', {
        escrow,
        timestamp: Date.now()
      });

      res.status(201).json({
        success: true,
        data: escrow,
        timestamp: Date.now()
      } as ApiResponse<Escrow>);
    } catch (error) {
      console.error('Error creating escrow:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CREATE_ESCROW_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create escrow'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- GET ESCROW --------------------
  router.get('/:escrowId', async (req: Request, res: Response) => {
    try {
      const { escrowId } = req.params;
      const escrow = escrowManager.getEscrow(escrowId);

      if (!escrow) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'ESCROW_NOT_FOUND',
            message: `Escrow ${escrowId} not found`
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      res.json({
        success: true,
        data: escrow,
        timestamp: Date.now()
      } as ApiResponse<Escrow>);
    } catch (error) {
      console.error('Error getting escrow:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_ESCROW_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get escrow'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- GET ESCROW BY INTENT --------------------
  router.get('/intent/:intentId', async (req: Request, res: Response) => {
    try {
      const { intentId } = req.params;
      const escrow = escrowManager.getEscrowByIntent(intentId);

      if (!escrow) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'ESCROW_NOT_FOUND',
            message: `No escrow found for intent ${intentId}`
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      res.json({
        success: true,
        data: escrow,
        timestamp: Date.now()
      } as ApiResponse<Escrow>);
    } catch (error) {
      console.error('Error getting escrow by intent:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_ESCROW_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get escrow'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- GET CLIENT ESCROWS --------------------
  router.get('/client/:clientAddress', async (req: Request, res: Response) => {
    try {
      const { clientAddress } = req.params;
      const escrows = escrowManager.getEscrowsByClient(clientAddress);

      res.json({
        success: true,
        data: {
          escrows,
          total: escrows.length
        },
        timestamp: Date.now()
      } as ApiResponse<{ escrows: Escrow[]; total: number }>);
    } catch (error) {
      console.error('Error getting client escrows:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_ESCROWS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get escrows'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- RELEASE ESCROW --------------------
  router.post('/:escrowId/release', async (req: Request, res: Response) => {
    try {
      const { escrowId } = req.params;
      const validation = ReleaseEscrowSchema.safeParse(req.body);

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

      const result = await escrowManager.release({
        escrowId,
        recipientAddress: validation.data.recipientAddress,
        amount: validation.data.amount,
        reason: validation.data.reason
      });

      // Broadcast release
      io.emit('escrow:released', {
        escrowId,
        ...result,
        timestamp: Date.now()
      });

      res.json({
        success: true,
        data: result,
        timestamp: Date.now()
      } as ApiResponse<typeof result>);
    } catch (error) {
      console.error('Error releasing escrow:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RELEASE_ESCROW_ERROR',
          message: error instanceof Error ? error.message : 'Failed to release escrow'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- REFUND ESCROW --------------------
  router.post('/:escrowId/refund', async (req: Request, res: Response) => {
    try {
      const { escrowId } = req.params;
      const { reason } = req.body;

      const result = await escrowManager.refund(escrowId, reason);

      // Broadcast refund
      io.emit('escrow:refunded', {
        escrowId,
        ...result,
        reason,
        timestamp: Date.now()
      });

      res.json({
        success: true,
        data: result,
        timestamp: Date.now()
      } as ApiResponse<typeof result>);
    } catch (error) {
      console.error('Error refunding escrow:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'REFUND_ESCROW_ERROR',
          message: error instanceof Error ? error.message : 'Failed to refund escrow'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- DISPUTE ESCROW --------------------
  router.post('/:escrowId/dispute', async (req: Request, res: Response) => {
    try {
      const { escrowId } = req.params;

      const escrow = escrowManager.dispute(escrowId);

      // Broadcast dispute
      io.emit('escrow:disputed', {
        escrowId,
        escrow,
        timestamp: Date.now()
      });

      res.json({
        success: true,
        data: escrow,
        timestamp: Date.now()
      } as ApiResponse<Escrow>);
    } catch (error) {
      console.error('Error disputing escrow:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DISPUTE_ESCROW_ERROR',
          message: error instanceof Error ? error.message : 'Failed to dispute escrow'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- SLASH ESCROW --------------------
  router.post('/:escrowId/slash', async (req: Request, res: Response) => {
    try {
      const { escrowId } = req.params;
      const { amount, recipientAddress, reason } = req.body;

      if (typeof amount !== 'number' || !recipientAddress || !reason) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'amount (number), recipientAddress, and reason are required'
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      const result = await escrowManager.slash(escrowId, amount, recipientAddress, reason);

      // Broadcast slash
      io.emit('escrow:slashed', {
        escrowId,
        ...result,
        timestamp: Date.now()
      });

      res.json({
        success: true,
        data: result,
        timestamp: Date.now()
      } as ApiResponse<typeof result>);
    } catch (error) {
      console.error('Error slashing escrow:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SLASH_ESCROW_ERROR',
          message: error instanceof Error ? error.message : 'Failed to slash escrow'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- GET STATS --------------------
  router.get('/stats/summary', async (req: Request, res: Response) => {
    try {
      const stats = escrowManager.getStats();

      res.json({
        success: true,
        data: stats,
        timestamp: Date.now()
      } as ApiResponse<typeof stats>);
    } catch (error) {
      console.error('Error getting escrow stats:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STATS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get escrow stats'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- CHECK ACTIVE ESCROW --------------------
  router.get('/check/:intentId', async (req: Request, res: Response) => {
    try {
      const { intentId } = req.params;
      const hasActive = escrowManager.hasActiveEscrow(intentId);
      const escrow = escrowManager.getEscrowByIntent(intentId);

      res.json({
        success: true,
        data: {
          hasActiveEscrow: hasActive,
          escrow: escrow || null
        },
        timestamp: Date.now()
      } as ApiResponse<{ hasActiveEscrow: boolean; escrow: Escrow | null }>);
    } catch (error) {
      console.error('Error checking escrow:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CHECK_ESCROW_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check escrow'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // Mount router
  app.use('/api/escrow', router);
}
