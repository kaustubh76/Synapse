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

  // -------------------- GET ESCROW CONFIG --------------------
  // IMPORTANT: This route MUST be before /:escrowId to avoid matching "config" as an ID
  router.get('/config', async (req: Request, res: Response) => {
    try {
      const config = escrowManager.getConfig();
      const isRealEnabled = escrowManager.isRealTransfersEnabled();

      res.json({
        success: true,
        data: {
          realTransfersEnabled: isRealEnabled,
          network: config.network,
          platformWallet: config.platformWallet || 'Not configured',
          escrowWalletConfigured: !!config.escrowPrivateKey
        },
        timestamp: Date.now()
      } as ApiResponse<{
        realTransfersEnabled: boolean;
        network: string;
        platformWallet: string;
        escrowWalletConfigured: boolean;
      }>);
    } catch (error) {
      console.error('Error getting escrow config:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CONFIG_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get escrow config'
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

  // ============================================================
  // REAL USDC TRANSFER ENDPOINTS
  // These endpoints execute actual on-chain transactions
  // ============================================================

  // -------------------- FUND ESCROW WITH REAL USDC --------------------
  router.post('/:escrowId/fund-real', async (req: Request, res: Response) => {
    try {
      const { escrowId } = req.params;
      const { clientPrivateKey } = req.body;

      if (!clientPrivateKey) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'clientPrivateKey is required for real USDC funding'
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      const result = await escrowManager.fundEscrowReal(escrowId, clientPrivateKey);

      io.emit('escrow:funded:real', {
        escrowId,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        explorerUrl: result.explorerUrl,
        timestamp: Date.now()
      });

      res.json({
        success: true,
        data: {
          escrowId,
          txHash: result.txHash,
          blockNumber: result.blockNumber,
          explorerUrl: result.explorerUrl,
          amount: result.amount,
          message: 'Real USDC escrow funded successfully'
        },
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error funding escrow with real USDC:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'REAL_FUND_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fund escrow with real USDC'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- RELEASE ESCROW WITH REAL USDC --------------------
  router.post('/:escrowId/release-real', async (req: Request, res: Response) => {
    try {
      const { escrowId } = req.params;
      const { recipientAddress, amount, escrowPrivateKey, reason } = req.body;

      if (!recipientAddress || typeof amount !== 'number') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'recipientAddress and amount are required'
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      const result = await escrowManager.releaseReal({
        escrowId,
        recipientAddress,
        amount,
        reason,
        escrowPrivateKey
      });

      io.emit('escrow:released:real', {
        escrowId,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        explorerUrl: result.explorerUrl,
        amount: result.amount,
        recipient: recipientAddress,
        timestamp: Date.now()
      });

      res.json({
        success: true,
        data: {
          ...result,
          message: 'Real USDC escrow released successfully'
        },
        timestamp: Date.now()
      } as ApiResponse<typeof result>);
    } catch (error) {
      console.error('Error releasing escrow with real USDC:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'REAL_RELEASE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to release escrow with real USDC'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- REFUND ESCROW WITH REAL USDC --------------------
  router.post('/:escrowId/refund-real', async (req: Request, res: Response) => {
    try {
      const { escrowId } = req.params;
      const { escrowPrivateKey, reason } = req.body;

      const result = await escrowManager.refundReal(escrowId, escrowPrivateKey, reason);

      io.emit('escrow:refunded:real', {
        escrowId,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        explorerUrl: result.explorerUrl,
        amount: result.amount,
        timestamp: Date.now()
      });

      res.json({
        success: true,
        data: {
          ...result,
          message: 'Real USDC escrow refunded successfully'
        },
        timestamp: Date.now()
      } as ApiResponse<typeof result>);
    } catch (error) {
      console.error('Error refunding escrow with real USDC:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'REAL_REFUND_ERROR',
          message: error instanceof Error ? error.message : 'Failed to refund escrow with real USDC'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- SLASH ESCROW WITH REAL USDC --------------------
  router.post('/:escrowId/slash-real', async (req: Request, res: Response) => {
    try {
      const { escrowId } = req.params;
      const { amount, recipientAddress, reason, escrowPrivateKey } = req.body;

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

      const result = await escrowManager.slashReal(escrowId, amount, recipientAddress, reason, escrowPrivateKey);

      io.emit('escrow:slashed:real', {
        escrowId,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        explorerUrl: result.explorerUrl,
        slashedAmount: result.slashedAmount,
        remainingAmount: result.remainingAmount,
        reason,
        timestamp: Date.now()
      });

      res.json({
        success: true,
        data: {
          ...result,
          message: 'Real USDC escrow slashed successfully'
        },
        timestamp: Date.now()
      } as ApiResponse<typeof result>);
    } catch (error) {
      console.error('Error slashing escrow with real USDC:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'REAL_SLASH_ERROR',
          message: error instanceof Error ? error.message : 'Failed to slash escrow with real USDC'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // Mount router
  app.use('/api/escrow', router);
}
