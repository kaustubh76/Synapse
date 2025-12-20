// ============================================================
// SYNAPSE x402 Payment Middleware
// HTTP-native micropayments for provider endpoints
// ============================================================

import { Request, Response, NextFunction } from 'express';

export interface X402Config {
  price: number;           // Price in USDC
  network: string;         // e.g., 'base', 'base-sepolia'
  token: string;           // e.g., 'USDC'
  recipient: string;       // Provider wallet address
  description?: string;    // Service description
  facilitatorUrl?: string; // x402 facilitator endpoint
}

export interface X402PaymentHeader {
  scheme: string;
  network: string;
  payload: string;
  signature: string;
}

// x402 HTTP headers
const HEADER_PAYMENT_REQUIRED = 'X-Payment';
const HEADER_PAYMENT = 'X-Payment';
const HEADER_PAYMENT_RESPONSE = 'X-Payment-Response';

/**
 * Parse x402 payment header from request
 */
function parsePaymentHeader(header: string | undefined): X402PaymentHeader | null {
  if (!header) return null;

  try {
    // x402 header format: base64 encoded JSON
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Create x402 payment required response
 */
function createPaymentRequiredResponse(config: X402Config): string {
  const payload = {
    scheme: 'exact',
    network: config.network,
    token: config.token,
    amount: config.price.toString(),
    recipient: config.recipient,
    description: config.description || 'Synapse Intent Service',
    expiresAt: Date.now() + 300000, // 5 minutes
  };

  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Verify x402 payment (simplified - in production, use x402 facilitator)
 */
async function verifyPayment(
  payment: X402PaymentHeader,
  config: X402Config,
  facilitatorUrl?: string
): Promise<{ valid: boolean; txHash?: string; error?: string }> {
  // In demo mode, simulate payment verification
  if (process.env.X402_DEMO_MODE === 'true') {
    return {
      valid: true,
      txHash: `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`
    };
  }

  // In production, verify with facilitator
  if (facilitatorUrl) {
    try {
      const response = await fetch(`${facilitatorUrl}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment,
          expectedAmount: config.price,
          expectedRecipient: config.recipient,
          network: config.network,
          token: config.token
        })
      });

      const result = await response.json();
      return {
        valid: result.valid,
        txHash: result.transactionHash,
        error: result.error
      };
    } catch (error) {
      return {
        valid: false,
        error: `Facilitator error: ${error}`
      };
    }
  }

  // Fallback: trust the payment header (for hackathon demo)
  return {
    valid: true,
    txHash: payment.payload
  };
}

/**
 * x402 Payment Middleware Factory
 *
 * Usage:
 * ```
 * app.use('/api/weather', x402Middleware({
 *   price: 0.01,
 *   network: 'base-sepolia',
 *   token: 'USDC',
 *   recipient: '0xProviderWallet...'
 * }));
 * ```
 */
export function x402Middleware(config: X402Config) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Check for payment header
    const paymentHeader = req.headers[HEADER_PAYMENT.toLowerCase()] as string | undefined;

    if (!paymentHeader) {
      // No payment provided - return 402 Payment Required
      res.status(402);
      res.setHeader(HEADER_PAYMENT_REQUIRED, createPaymentRequiredResponse(config));
      res.json({
        error: 'Payment Required',
        code: 'PAYMENT_REQUIRED',
        x402: {
          scheme: 'exact',
          network: config.network,
          token: config.token,
          amount: config.price,
          recipient: config.recipient,
          description: config.description
        }
      });
      return;
    }

    // Parse and verify payment
    const payment = parsePaymentHeader(paymentHeader);

    if (!payment) {
      res.status(400).json({
        error: 'Invalid payment header',
        code: 'INVALID_PAYMENT'
      });
      return;
    }

    // Verify payment
    const verification = await verifyPayment(
      payment,
      config,
      config.facilitatorUrl || process.env.X402_FACILITATOR_URL
    );

    if (!verification.valid) {
      res.status(402).json({
        error: 'Payment verification failed',
        code: 'PAYMENT_INVALID',
        details: verification.error
      });
      return;
    }

    // Payment verified - add payment info to request
    (req as any).x402Payment = {
      verified: true,
      txHash: verification.txHash,
      amount: config.price,
      network: config.network,
      token: config.token
    };

    // Add payment response header
    res.setHeader(HEADER_PAYMENT_RESPONSE, Buffer.from(JSON.stringify({
      success: true,
      txHash: verification.txHash,
      amount: config.price
    })).toString('base64'));

    next();
  };
}

/**
 * Dynamic pricing middleware - price based on request params
 */
export function x402DynamicMiddleware(
  getPriceConfig: (req: Request) => X402Config | null
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const config = getPriceConfig(req);

    if (!config) {
      // No payment required for this request
      next();
      return;
    }

    // Use standard middleware with dynamic config
    const middleware = x402Middleware(config);
    return middleware(req, res, next);
  };
}

/**
 * Helper to create x402 payment header for client requests
 */
export function createPaymentHeader(payment: {
  txHash: string;
  signature: string;
  network: string;
}): string {
  const payload: X402PaymentHeader = {
    scheme: 'exact',
    network: payment.network,
    payload: payment.txHash,
    signature: payment.signature
  };

  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Simulate x402 payment for demo purposes
 */
export function simulateX402Payment(
  amount: number,
  recipient: string,
  network: string = 'base-sepolia'
): { header: string; txHash: string } {
  const txHash = `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`;

  const header = createPaymentHeader({
    txHash,
    signature: `sig_${Date.now()}`,
    network
  });

  return { header, txHash };
}

export default x402Middleware;
