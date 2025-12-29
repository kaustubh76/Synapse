// ============================================================
// SYNAPSE API - Payment Routes (x402 Integration)
// Real USDC transfers using EigenCloud wallet
// ============================================================

import { Router, Express, Request, Response } from 'express';
import { z } from 'zod';
import { ethers } from 'ethers';
import {
  IntentEngine,
  ApiResponse,
  PaymentResult
} from '@synapse/core';
import { getUSDCTransfer } from '@synapse/mcp-x402';

// EigenCloud wallet configuration
const EIGENCLOUD_PRIVATE_KEY = process.env.EIGENCLOUD_PRIVATE_KEY || '';
const EIGENCLOUD_WALLET_ADDRESS = process.env.EIGENCLOUD_WALLET_ADDRESS || '0xcF1A4587a4470634fc950270cab298B79b258eDe';
const PLATFORM_WALLET = process.env.SYNAPSE_PLATFORM_WALLET || '0x742d35Cc6634C0532925a3b844Bc9e7595f5bE21';

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

  // -------------------- EXECUTE REAL PAYMENT --------------------
  // Executes real USDC payment using EigenCloud wallet
  router.post('/execute', async (req: Request, res: Response) => {
    try {
      const { intentId, providerAddress, recipient } = req.body;

      // Validate EigenCloud wallet is configured
      if (!EIGENCLOUD_PRIVATE_KEY) {
        return res.status(500).json({
          success: false,
          error: {
            code: 'WALLET_NOT_CONFIGURED',
            message: 'EigenCloud wallet private key not configured'
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

      // Execute real USDC transfer
      const usdcTransfer = getUSDCTransfer();
      const paymentRecipient = recipient || PLATFORM_WALLET;

      console.log(`[Payment] Executing real USDC transfer: ${winningBid.bidAmount} USDC to ${paymentRecipient}`);

      const transferResult = await usdcTransfer.transferWithPrivateKey(
        EIGENCLOUD_PRIVATE_KEY,
        {
          recipient: paymentRecipient,
          amount: winningBid.bidAmount,
          reason: `Intent ${intentId} payment to provider ${providerAddress}`,
        }
      );

      if (!transferResult.success) {
        return res.status(500).json({
          success: false,
          error: {
            code: 'TRANSFER_FAILED',
            message: transferResult.error || 'USDC transfer failed'
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      // Record the payment with real transaction hash
      intentEngine.recordPayment(intentId, winningBid.bidAmount, transferResult.txHash!);

      const paymentResult: PaymentResult = {
        success: true,
        transactionHash: transferResult.txHash!,
        settledAmount: winningBid.bidAmount,
        networkFee: transferResult.gasUsed ? Number(transferResult.gasUsed) / 1e18 : 0
      };

      console.log(`[Payment] Real USDC transfer complete: ${transferResult.txHash}`);

      res.json({
        success: true,
        data: {
          ...paymentResult,
          explorerUrl: transferResult.explorerUrl,
          blockNumber: transferResult.blockNumber,
          sender: EIGENCLOUD_WALLET_ADDRESS,
          recipient: paymentRecipient,
        },
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error executing payment:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'EXECUTE_PAYMENT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to execute payment'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- EXECUTE PAYMENT (Real USDC Only) --------------------
  // Executes real USDC payment - no simulation fallback
  router.post('/simulate', async (req: Request, res: Response) => {
    try {
      const { intentId, providerAddress } = req.body;

      // REQUIRE real wallet configuration - no simulations
      if (!EIGENCLOUD_PRIVATE_KEY) {
        return res.status(500).json({
          success: false,
          error: {
            code: 'WALLET_NOT_CONFIGURED',
            message: 'EIGENCLOUD_PRIVATE_KEY not configured. Real payments require wallet setup.'
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

      // Execute real USDC transfer
      const usdcTransfer = getUSDCTransfer();

      console.log(`[Payment] Executing real transfer for ${winningBid.bidAmount} USDC`);

      const transferResult = await usdcTransfer.transferWithPrivateKey(
        EIGENCLOUD_PRIVATE_KEY,
        {
          recipient: PLATFORM_WALLET,
          amount: winningBid.bidAmount,
          reason: `Intent ${intentId} payment`,
        }
      );

      if (!transferResult.success || !transferResult.txHash) {
        return res.status(500).json({
          success: false,
          error: {
            code: 'TRANSFER_FAILED',
            message: transferResult.error || 'USDC transfer failed'
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      intentEngine.recordPayment(intentId, winningBid.bidAmount, transferResult.txHash);

      const paymentResult: PaymentResult = {
        success: true,
        transactionHash: transferResult.txHash,
        settledAmount: winningBid.bidAmount,
        networkFee: transferResult.gasUsed ? Number(transferResult.gasUsed) / 1e18 : 0
      };

      console.log(`[Payment] Real USDC transfer complete: ${transferResult.txHash}`);

      res.json({
        success: true,
        data: {
          ...paymentResult,
          explorerUrl: transferResult.explorerUrl,
          blockNumber: transferResult.blockNumber,
          isRealTransfer: true,
        },
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error executing payment:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PAYMENT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to execute payment'
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
