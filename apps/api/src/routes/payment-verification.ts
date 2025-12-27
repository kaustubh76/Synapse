// ============================================================
// SYNAPSE PAYMENT API
// On-chain payment verification and tracking
// ============================================================

import { Router, Request, Response } from 'express';
import {
  getPaymentVerifier,
  type PaymentExpectation,
} from '@synapse/mcp-x402';

const router = Router();

// Store verified payments for audit trail
const verifiedPayments = new Map<string, {
  txHash: string;
  verified: boolean;
  amount: number;
  sender: string;
  recipient: string;
  verifiedAt: number;
  blockNumber?: number;
  resource?: string;
}>();

// -------------------- VERIFY PAYMENT --------------------

/**
 * POST /api/payment/verify
 * Verify a USDC payment on-chain
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { txHash, expectedAmount, expectedRecipient, expectedSender, resource } = req.body;

    if (!txHash) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TX_HASH', message: 'txHash is required' },
        timestamp: Date.now(),
      });
    }

    if (!expectedAmount || expectedAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_AMOUNT', message: 'expectedAmount is required and must be positive' },
        timestamp: Date.now(),
      });
    }

    if (!expectedRecipient) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_RECIPIENT', message: 'expectedRecipient is required' },
        timestamp: Date.now(),
      });
    }

    const verifier = getPaymentVerifier();

    // Check if address is valid
    if (!verifier.isValidAddress(expectedRecipient)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_RECIPIENT', message: 'expectedRecipient is not a valid address' },
        timestamp: Date.now(),
      });
    }

    if (expectedSender && !verifier.isValidAddress(expectedSender)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_SENDER', message: 'expectedSender is not a valid address' },
        timestamp: Date.now(),
      });
    }

    const expectation: PaymentExpectation = {
      amount: expectedAmount,
      recipient: expectedRecipient,
      sender: expectedSender,
      tolerance: 0.01, // 1% tolerance for gas variations
    };

    console.log(`[Payment API] Verifying tx ${txHash} for ${expectedAmount} USDC to ${expectedRecipient}`);

    const result = await verifier.verifyPayment(txHash, expectation);

    // Store verified payment
    if (result.verified) {
      verifiedPayments.set(txHash.toLowerCase(), {
        txHash,
        verified: true,
        amount: result.actualAmount || expectedAmount,
        sender: result.actualSender || expectedSender || 'unknown',
        recipient: result.actualRecipient || expectedRecipient,
        verifiedAt: Date.now(),
        blockNumber: result.blockNumber,
        resource,
      });
    }

    res.json({
      success: true,
      data: {
        verified: result.verified,
        txHash,
        blockNumber: result.blockNumber,
        blockTimestamp: result.blockTimestamp,
        actualAmount: result.actualAmount,
        actualSender: result.actualSender,
        actualRecipient: result.actualRecipient,
        confirmations: result.confirmations,
        explorerUrl: verifier.getExplorerUrl(txHash),
        details: result.details,
        error: result.error,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Payment API] Verify error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'VERIFICATION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

// -------------------- GET TRANSACTION DETAILS --------------------

/**
 * GET /api/payment/tx/:txHash
 * Get detailed transaction information
 */
router.get('/tx/:txHash', async (req: Request, res: Response) => {
  try {
    const { txHash } = req.params;

    const verifier = getPaymentVerifier();
    const details = await verifier.getTransactionDetails(txHash);

    if (!details) {
      return res.status(404).json({
        success: false,
        error: { code: 'TX_NOT_FOUND', message: 'Transaction not found' },
        timestamp: Date.now(),
      });
    }

    res.json({
      success: true,
      data: {
        ...details,
        explorerUrl: verifier.getExplorerUrl(txHash),
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Payment API] Get tx error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TX_FETCH_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

// -------------------- WAIT FOR CONFIRMATION --------------------

/**
 * POST /api/payment/wait
 * Wait for a transaction to be confirmed
 */
router.post('/wait', async (req: Request, res: Response) => {
  try {
    const { txHash, minConfirmations = 1, timeout = 60000 } = req.body;

    if (!txHash) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TX_HASH', message: 'txHash is required' },
        timestamp: Date.now(),
      });
    }

    const verifier = getPaymentVerifier();

    console.log(`[Payment API] Waiting for ${minConfirmations} confirmations on ${txHash}`);

    const result = await verifier.waitForConfirmation(
      txHash,
      minConfirmations,
      Math.min(timeout, 120000) // Cap at 2 minutes
    );

    res.json({
      success: true,
      data: {
        confirmed: result.verified,
        txHash,
        blockNumber: result.blockNumber,
        confirmations: result.confirmations,
        error: result.error,
        explorerUrl: verifier.getExplorerUrl(txHash),
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Payment API] Wait error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'WAIT_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

// -------------------- BATCH VERIFY --------------------

/**
 * POST /api/payment/verify-batch
 * Verify multiple payments at once
 */
router.post('/verify-batch', async (req: Request, res: Response) => {
  try {
    const { payments } = req.body;

    if (!Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PAYMENTS', message: 'payments array is required' },
        timestamp: Date.now(),
      });
    }

    if (payments.length > 10) {
      return res.status(400).json({
        success: false,
        error: { code: 'TOO_MANY_PAYMENTS', message: 'Maximum 10 payments per batch' },
        timestamp: Date.now(),
      });
    }

    const verifier = getPaymentVerifier();

    const paymentRequests = payments.map((p: any) => ({
      txHash: p.txHash,
      expected: {
        amount: p.expectedAmount,
        recipient: p.expectedRecipient,
        sender: p.expectedSender,
        tolerance: 0.01,
      },
    }));

    const results = await verifier.verifyPayments(paymentRequests);

    const data: any[] = [];
    results.forEach((result, txHash) => {
      data.push({
        txHash,
        verified: result.verified,
        actualAmount: result.actualAmount,
        error: result.error,
      });
    });

    res.json({
      success: true,
      data: {
        results: data,
        verifiedCount: data.filter(d => d.verified).length,
        failedCount: data.filter(d => !d.verified).length,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Payment API] Batch verify error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'BATCH_VERIFY_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

// -------------------- GET VERIFIED PAYMENTS --------------------

/**
 * GET /api/payment/verified
 * Get list of verified payments (for audit)
 */
router.get('/verified', (req: Request, res: Response) => {
  const payments = Array.from(verifiedPayments.values())
    .sort((a, b) => b.verifiedAt - a.verifiedAt)
    .slice(0, 100); // Limit to last 100

  res.json({
    success: true,
    data: {
      payments,
      count: payments.length,
      totalVerified: verifiedPayments.size,
    },
    timestamp: Date.now(),
  });
});

// -------------------- CHECK VERIFICATION STATUS --------------------

/**
 * GET /api/payment/status/:txHash
 * Check if a payment has been verified
 */
router.get('/status/:txHash', (req: Request, res: Response) => {
  const { txHash } = req.params;
  const payment = verifiedPayments.get(txHash.toLowerCase());

  const verifier = getPaymentVerifier();

  res.json({
    success: true,
    data: {
      txHash,
      previouslyVerified: !!payment,
      payment: payment || null,
      explorerUrl: verifier.getExplorerUrl(txHash),
    },
    timestamp: Date.now(),
  });
});

// -------------------- NETWORK INFO --------------------

/**
 * GET /api/payment/network
 * Get network configuration info
 */
router.get('/network', async (req: Request, res: Response) => {
  try {
    const verifier = getPaymentVerifier();
    const currentBlock = await verifier.getCurrentBlock();

    res.json({
      success: true,
      data: {
        network: 'base-sepolia',
        chainId: 84532,
        usdcAddress: verifier.getUSDCAddress(),
        explorerUrl: 'https://sepolia.basescan.org',
        currentBlock,
        rpcHealthy: true,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.json({
      success: true,
      data: {
        network: 'base-sepolia',
        chainId: 84532,
        usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        explorerUrl: 'https://sepolia.basescan.org',
        currentBlock: null,
        rpcHealthy: false,
        error: error instanceof Error ? error.message : 'RPC error',
      },
      timestamp: Date.now(),
    });
  }
});

// -------------------- USDC BALANCE --------------------

/**
 * GET /api/payment-verification/balance/:address
 * Get USDC and ETH balance for an address
 */
router.get('/balance/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;

    // Dynamically import to avoid circular dependency
    const { getUSDCTransfer } = await import('@synapse/mcp-x402');
    const transfer = getUSDCTransfer();

    if (!transfer.isValidAddress(address)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ADDRESS', message: 'Invalid Ethereum address' },
        timestamp: Date.now(),
      });
    }

    const balance = await transfer.getWalletBalance(address);

    res.json({
      success: true,
      data: {
        address,
        usdc: balance.usdc,
        usdcWei: balance.usdcWei.toString(),
        eth: balance.eth,
        ethWei: balance.ethWei.toString(),
        hasGas: balance.eth >= 0.0001,
        canTransfer: balance.usdc > 0 && balance.eth >= 0.0001,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Payment API] Balance error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'BALANCE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

// -------------------- TRANSFER USDC --------------------

/**
 * POST /api/payment-verification/transfer
 * Execute a real USDC transfer (requires private key)
 */
router.post('/transfer', async (req: Request, res: Response) => {
  try {
    const { privateKey, recipient, amount, reason } = req.body;

    if (!privateKey) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PRIVATE_KEY', message: 'privateKey is required' },
        timestamp: Date.now(),
      });
    }

    if (!recipient) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_RECIPIENT', message: 'recipient is required' },
        timestamp: Date.now(),
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_AMOUNT', message: 'amount must be positive' },
        timestamp: Date.now(),
      });
    }

    const { getUSDCTransfer } = await import('@synapse/mcp-x402');
    const transfer = getUSDCTransfer();

    if (!transfer.isValidAddress(recipient)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_RECIPIENT', message: 'Invalid recipient address' },
        timestamp: Date.now(),
      });
    }

    console.log(`[Payment API] Initiating USDC transfer of ${amount} to ${recipient}`);

    const result = await transfer.transferWithPrivateKey(privateKey, {
      recipient,
      amount,
      reason,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TRANSFER_FAILED',
          message: result.error || 'Transfer failed',
        },
        timestamp: Date.now(),
      });
    }

    res.json({
      success: true,
      data: {
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        amount: result.amount,
        recipient: result.recipient,
        sender: result.sender,
        gasUsed: result.gasUsed?.toString(),
        explorerUrl: result.explorerUrl,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Payment API] Transfer error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TRANSFER_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

// -------------------- ESTIMATE GAS --------------------

/**
 * GET /api/payment-verification/estimate-gas
 * Estimate gas cost for a USDC transfer
 */
router.get('/estimate-gas', async (req: Request, res: Response) => {
  try {
    const { getUSDCTransfer } = await import('@synapse/mcp-x402');
    const transfer = getUSDCTransfer();

    const gasPrice = await transfer.getGasPrice();
    const estimatedCostEth = await transfer.estimateTransferCost();

    res.json({
      success: true,
      data: {
        gasPriceWei: gasPrice.toString(),
        gasPriceGwei: Number(gasPrice) / 1e9,
        estimatedGas: 65000,
        estimatedCostEth,
        estimatedCostUsd: estimatedCostEth * 2000, // Rough ETH price estimate
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Payment API] Gas estimate error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GAS_ESTIMATE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

// -------------------- GENERATE WALLET --------------------

/**
 * POST /api/payment-verification/generate-wallet
 * Generate a new Ethereum wallet
 */
router.post('/generate-wallet', async (req: Request, res: Response) => {
  try {
    const { getUSDCTransfer } = await import('@synapse/mcp-x402');
    const transfer = getUSDCTransfer();

    const wallet = transfer.generateWallet();

    res.json({
      success: true,
      data: {
        address: wallet.address,
        privateKey: wallet.privateKey,
        warning: 'Store the private key securely. It cannot be recovered if lost.',
        faucetUrl: 'https://faucet.circle.com/', // Circle USDC faucet
        baseFaucetUrl: 'https://www.coinbase.com/faucets/base-sepolia', // Base Sepolia ETH faucet
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Payment API] Wallet generation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'WALLET_GENERATION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
    });
  }
});

// -------------------- EXPORTS --------------------

export function setupPaymentVerificationRoutes(app: any): void {
  app.use('/api/payment-verification', router);
  console.log('[Payment Verification API] Routes mounted at /api/payment-verification');
}

export default router;
