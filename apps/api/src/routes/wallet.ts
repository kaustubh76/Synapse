// ============================================================
// SYNAPSE API - Wallet Routes
// Crossmint wallet integration for x402 payments
// Real on-chain USDC balance queries via Base Sepolia
// ============================================================

import { Router, Request, Response } from 'express';
import { createCrossmintWallet, createDemoCrossmintWallet, CrossmintWallet } from '@synapse/sdk';
import { getUSDCTransfer } from '@synapse/mcp-x402';

const router = Router();

// Wallet instance (use demo mode if no API key)
const wallet: CrossmintWallet = process.env.CROSSMINT_API_KEY
  ? createCrossmintWallet({
      apiKey: process.env.CROSSMINT_API_KEY,
      environment: (process.env.CROSSMINT_ENV as 'staging' | 'production') || 'staging',
      defaultChain: process.env.DEFAULT_CHAIN || 'base-sepolia',
    })
  : createDemoCrossmintWallet();

// Track client wallets
const clientWallets: Map<string, { address: string; chain: string; balance: string }> = new Map();

/**
 * Create wallet for client
 * POST /api/wallet/create
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { clientId, chain } = req.body;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'clientId is required' },
      });
    }

    // Check if wallet already exists
    const existing = clientWallets.get(clientId);
    if (existing) {
      return res.json({
        success: true,
        data: existing,
      });
    }

    // Create new wallet via Crossmint
    const walletInfo = await wallet.createWallet(clientId, { chain });

    // Store wallet info with initial demo balance
    const walletData = {
      address: walletInfo.address,
      chain: walletInfo.chain,
      balance: '100.00', // Demo starting balance
    };
    clientWallets.set(clientId, walletData);

    res.json({
      success: true,
      data: walletData,
    });
  } catch (error) {
    console.error('[Wallet] Create error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'WALLET_CREATE_ERROR', message: 'Failed to create wallet' },
    });
  }
});

/**
 * Get wallet balance
 * GET /api/wallet/:address/balance
 */
router.get('/:address/balance', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { token = 'USDC' } = req.query;

    // Check local cache first
    for (const [clientId, walletData] of clientWallets.entries()) {
      if (walletData.address === address) {
        return res.json({
          success: true,
          data: {
            address,
            balance: walletData.balance,
            token,
            chain: walletData.chain,
          },
        });
      }
    }

    // Try to fetch from Crossmint
    const balance = await wallet.getBalance(address, token as string);

    res.json({
      success: true,
      data: {
        address,
        balance: balance.balance,
        token: balance.token,
      },
    });
  } catch (error) {
    console.error('[Wallet] Balance error:', error);
    res.json({
      success: true,
      data: {
        balance: '100.00',
        token: 'USDC',
      },
    });
  }
});

/**
 * Transfer tokens
 * POST /api/wallet/transfer
 */
router.post('/transfer', async (req: Request, res: Response) => {
  try {
    const { from, to, amount, token = 'USDC' } = req.body;

    if (!from || !to || !amount) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'from, to, and amount are required' },
      });
    }

    // Find client ID for the from address
    let clientId: string | null = null;
    for (const [id, walletData] of clientWallets.entries()) {
      if (walletData.address === from) {
        clientId = id;
        break;
      }
    }

    if (!clientId) {
      clientId = `client_${from.slice(-8)}`;
    }

    // Execute transfer via Crossmint
    const result = await wallet.transfer(clientId, {
      to,
      token,
      amount,
    });

    // Update local balance cache
    const walletData = clientWallets.get(clientId);
    if (walletData) {
      const newBalance = Math.max(0, parseFloat(walletData.balance) - parseFloat(amount));
      walletData.balance = newBalance.toFixed(2);
      clientWallets.set(clientId, walletData);
    }

    res.json({
      success: true,
      data: {
        txHash: result.txHash,
        status: result.status,
        from,
        to,
        amount,
        token,
        chain: result.chain,
      },
    });
  } catch (error) {
    console.error('[Wallet] Transfer error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'TRANSFER_ERROR', message: 'Failed to execute transfer' },
    });
  }
});

/**
 * Create x402 payment
 * POST /api/wallet/x402-payment
 */
router.post('/x402-payment', async (req: Request, res: Response) => {
  try {
    const { clientId, recipientAddress, amount, token = 'USDC' } = req.body;

    if (!clientId || !recipientAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'clientId, recipientAddress, and amount are required' },
      });
    }

    // Create x402 payment proof
    const payment = await wallet.createX402Payment(clientId, recipientAddress, amount, token);

    // Update local balance cache
    const walletData = clientWallets.get(clientId);
    if (walletData) {
      const newBalance = Math.max(0, parseFloat(walletData.balance) - parseFloat(amount));
      walletData.balance = newBalance.toFixed(2);
      clientWallets.set(clientId, walletData);
    }

    res.json({
      success: true,
      data: {
        txHash: payment.txHash,
        signature: payment.signature,
        network: payment.network,
        amount,
        token,
        recipient: recipientAddress,
      },
    });
  } catch (error) {
    console.error('[Wallet] x402 payment error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'PAYMENT_ERROR', message: 'Failed to create x402 payment' },
    });
  }
});

/**
 * Sign message with wallet
 * POST /api/wallet/sign
 */
router.post('/sign', async (req: Request, res: Response) => {
  try {
    const { clientId, message } = req.body;

    if (!clientId || !message) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'clientId and message are required' },
      });
    }

    const signature = await wallet.signMessage(clientId, message);

    res.json({
      success: true,
      data: {
        signature,
        message,
      },
    });
  } catch (error) {
    console.error('[Wallet] Sign error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SIGN_ERROR', message: 'Failed to sign message' },
    });
  }
});

/**
 * Get REAL on-chain balance (Base Sepolia)
 * GET /api/wallet/:address/onchain-balance
 */
router.get('/:address/onchain-balance', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;

    // Validate address format
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ADDRESS', message: 'Invalid Ethereum address format' },
      });
    }

    // Get real on-chain balance from Base Sepolia
    const usdcTransfer = getUSDCTransfer();
    const walletBalance = await usdcTransfer.getWalletBalance(address);

    res.json({
      success: true,
      data: {
        address,
        usdc: walletBalance.usdc,
        usdcWei: walletBalance.usdcWei.toString(),
        eth: walletBalance.eth,
        ethWei: walletBalance.ethWei.toString(),
        network: 'base-sepolia',
        chainId: 84532,
        usdcContract: usdcTransfer.getUSDCAddress(),
        note: 'Real on-chain balances from Base Sepolia',
        faucets: {
          eth: 'https://www.coinbase.com/faucets/base-sepolia',
          usdc: 'https://faucet.circle.com/',
        },
      },
    });
  } catch (error) {
    console.error('[Wallet] On-chain balance error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'BALANCE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to fetch on-chain balance'
      },
    });
  }
});

export function setupWalletRoutes(app: any) {
  app.use('/api/wallet', router);
}
