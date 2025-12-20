// ============================================================
// SYNAPSE API - Payment Routes (x402 Integration)
// ============================================================

import { Router, Express, Request, Response } from 'express';
import { z } from 'zod';
import {
  IntentEngine,
  ApiResponse,
  PaymentResult
} from '@synapse/core';

// Validation schemas
const RecordPaymentSchema = z.object({
  intentId: z.string(),
  amount: z.number().positive(),
  transactionHash: z.string(),
  network: z.string().default('base-sepolia'),
  payer: z.string(),
  recipient: z.string()
});

const CreateEscrowSchema = z.object({
  intentId: z.string(),
  amount: z.number().positive(),
  clientAddress: z.string()
});

export function setupPaymentRoutes(
  app: Express,
  intentEngine: IntentEngine
): void {
  const router = Router();

  // -------------------- RECORD PAYMENT --------------------
  // Called after x402 payment is settled
  router.post('/record', async (req: Request, res: Response) => {
    try {
      const validation = RecordPaymentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid payment data',
            details: validation.error.errors
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      const { intentId, amount, transactionHash } = validation.data;

      intentEngine.recordPayment(intentId, amount, transactionHash);

      res.json({
        success: true,
        data: {
          success: true,
          transactionHash,
          settledAmount: amount,
          networkFee: 0
        } as PaymentResult,
        timestamp: Date.now()
      } as ApiResponse<PaymentResult>);
    } catch (error) {
      console.error('Error recording payment:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RECORD_PAYMENT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to record payment'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- GET PAYMENT STATUS --------------------
  router.get('/status/:intentId', async (req: Request, res: Response) => {
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

      const paymentStatus = {
        intentId,
        isPaid: !!intent.result?.settlementTx,
        amount: intent.result?.settledAmount || 0,
        transactionHash: intent.result?.settlementTx || null,
        maxBudget: intent.maxBudget,
        refundAmount: intent.result ?
          intent.maxBudget - (intent.result.settledAmount || 0) : 0
      };

      res.json({
        success: true,
        data: paymentStatus,
        timestamp: Date.now()
      } as ApiResponse<typeof paymentStatus>);
    } catch (error) {
      console.error('Error getting payment status:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PAYMENT_STATUS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get payment status'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- SIMULATE x402 PAYMENT --------------------
  // For demo purposes - simulates the x402 payment flow
  router.post('/simulate', async (req: Request, res: Response) => {
    try {
      const { intentId, providerAddress } = req.body;

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

      // Get the winning bid amount
      const bids = intentEngine.getBidsForIntent(intentId);
      const winningBid = bids.find(b => b.providerAddress === providerAddress);

      if (!winningBid) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_WINNING_BID',
            message: 'No winning bid found for this provider'
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      // Simulate x402 payment
      const simulatedTxHash = `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;

      // Record the payment
      intentEngine.recordPayment(intentId, winningBid.bidAmount, simulatedTxHash);

      const paymentResult: PaymentResult = {
        success: true,
        transactionHash: simulatedTxHash,
        settledAmount: winningBid.bidAmount,
        networkFee: 0.0001 // Simulated network fee
      };

      res.json({
        success: true,
        data: paymentResult,
        timestamp: Date.now()
      } as ApiResponse<PaymentResult>);
    } catch (error) {
      console.error('Error simulating payment:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SIMULATE_PAYMENT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to simulate payment'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- x402 CONFIG --------------------
  // Returns x402 configuration for clients
  router.get('/x402/config', async (req: Request, res: Response) => {
    try {
      const config = {
        network: process.env.X402_NETWORK || 'base-sepolia',
        facilitatorUrl: process.env.X402_FACILITATOR_URL || 'https://x402.org/facilitator',
        supportedTokens: ['USDC'],
        supportedChains: ['base', 'base-sepolia', 'polygon', 'arbitrum'],
        paymentHeaders: {
          request: 'X-PAYMENT',
          response: 'X-PAYMENT-RESPONSE'
        }
      };

      res.json({
        success: true,
        data: config,
        timestamp: Date.now()
      } as ApiResponse<typeof config>);
    } catch (error) {
      console.error('Error getting x402 config:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'X402_CONFIG_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get x402 config'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // Mount router
  app.use('/api/payments', router);
}
