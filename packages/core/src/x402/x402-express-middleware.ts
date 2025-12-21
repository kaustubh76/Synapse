// ============================================================
// SYNAPSE x402 Express Middleware
// Production-ready x402 payment middleware for Express
// ============================================================

import { Request, Response, NextFunction } from 'express';
import {
  X402MiddlewareConfig,
  X402PaymentRequirements,
  X402PaymentPayload,
  X402Facilitator,
  X402Network,
  USDC_ADDRESSES,
  X402_HEADERS,
  encodePaymentRequirements,
  decodePaymentPayload,
  generateNonce,
} from './x402-types.js';
import { getDefaultFacilitator, ThirdwebFacilitator } from './x402-facilitator.js';

/**
 * Extended request with payment info
 */
export interface X402Request extends Request {
  x402Payment?: {
    verified: boolean;
    amount: string;
    from: string;
    to: string;
    token: string;
    network: X402Network;
    txHash?: string;
  };
}

/**
 * Create x402 payment requirements for a request
 */
function createPaymentRequirements(
  config: X402MiddlewareConfig,
  req: Request
): X402PaymentRequirements {
  const tokenAddress = config.tokenAddress || USDC_ADDRESSES[config.network];

  return {
    scheme: 'exact',
    network: config.network,
    tokenAddress,
    tokenSymbol: config.tokenSymbol || 'USDC',
    amount: config.price,
    recipient: config.recipient,
    description: config.description || `Payment for ${req.method} ${req.path}`,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    nonce: generateNonce(),
  };
}

/**
 * Send 402 Payment Required response
 */
function sendPaymentRequired(
  res: Response,
  requirements: X402PaymentRequirements
): void {
  const encoded = encodePaymentRequirements(requirements);

  res.status(402);
  res.setHeader(X402_HEADERS.PAYMENT_REQUIRED, encoded);
  res.json({
    error: 'Payment Required',
    code: 'PAYMENT_REQUIRED',
    x402: {
      scheme: requirements.scheme,
      network: requirements.network,
      token: requirements.tokenSymbol,
      tokenAddress: requirements.tokenAddress,
      amount: requirements.amount,
      recipient: requirements.recipient,
      description: requirements.description,
      expiresAt: requirements.expiresAt,
    },
  });
}

/**
 * x402 Payment Middleware
 *
 * Adds x402 payment protection to Express routes. Returns 402 if no payment
 * is provided, verifies and settles payments when present.
 *
 * Usage:
 * ```typescript
 * import { x402Middleware } from '@synapse/core/x402';
 *
 * // Protect a route with x402 payment
 * app.get('/api/data',
 *   x402Middleware({
 *     price: '0.01',
 *     network: 'base-sepolia',
 *     recipient: '0xYourWallet...',
 *     description: 'Data API access'
 *   }),
 *   (req, res) => {
 *     // Only reached after payment verified
 *     res.json({ data: 'premium content' });
 *   }
 * );
 * ```
 */
export function x402Middleware(config: X402MiddlewareConfig) {
  // Get or create facilitator
  const facilitator = config.facilitator || getDefaultFacilitator();

  return async (req: X402Request, res: Response, next: NextFunction) => {
    try {
      // Check for payment header
      const paymentHeader = req.headers[X402_HEADERS.PAYMENT.toLowerCase()] as string | undefined;

      if (!paymentHeader) {
        // No payment - return 402 Payment Required
        const requirements = createPaymentRequirements(config, req);
        return sendPaymentRequired(res, requirements);
      }

      // Parse payment payload
      const payload = decodePaymentPayload(paymentHeader);
      if (!payload) {
        return res.status(400).json({
          error: 'Invalid payment header',
          code: 'INVALID_PAYMENT_FORMAT',
        });
      }

      // Create requirements for verification
      const requirements = createPaymentRequirements(config, req);

      // Verify payment
      const verification = await facilitator.verify(payload, requirements);

      if (!verification.valid) {
        return res.status(402).json({
          error: 'Payment verification failed',
          code: 'PAYMENT_INVALID',
          details: verification.error,
        });
      }

      // Settle payment (if not demo mode)
      let txHash: string | undefined;

      if (facilitator instanceof ThirdwebFacilitator && !facilitator.isDemoMode) {
        const settlement = await facilitator.settle(payload, requirements);

        if (!settlement.success) {
          return res.status(402).json({
            error: 'Payment settlement failed',
            code: 'SETTLEMENT_FAILED',
            details: settlement.error,
          });
        }

        txHash = settlement.txHash;
      } else {
        // Demo mode - generate fake tx hash
        txHash = `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`;
      }

      // Attach payment info to request
      req.x402Payment = {
        verified: true,
        amount: verification.amount || config.price,
        from: verification.from || payload.authorization.from,
        to: verification.to || config.recipient,
        token: verification.token || requirements.tokenAddress,
        network: verification.network || config.network,
        txHash,
      };

      // Add payment response header
      const responseData = {
        success: true,
        txHash,
        amount: req.x402Payment.amount,
        settledAt: Date.now(),
      };
      res.setHeader(
        X402_HEADERS.PAYMENT_RESPONSE,
        Buffer.from(JSON.stringify(responseData)).toString('base64')
      );

      // Continue to route handler
      next();
    } catch (error) {
      console.error('[x402 Middleware] Error:', error);
      res.status(500).json({
        error: 'Payment processing error',
        code: 'PAYMENT_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

/**
 * Dynamic pricing middleware
 *
 * Allows setting price based on request parameters.
 *
 * Usage:
 * ```typescript
 * app.get('/api/data/:tier',
 *   x402DynamicMiddleware((req) => {
 *     const prices = { basic: '0.01', pro: '0.05', enterprise: '0.10' };
 *     return {
 *       price: prices[req.params.tier] || '0.01',
 *       network: 'base-sepolia',
 *       recipient: '0xYourWallet...',
 *     };
 *   }),
 *   (req, res) => {
 *     res.json({ tier: req.params.tier });
 *   }
 * );
 * ```
 */
export function x402DynamicMiddleware(
  getConfig: (req: Request) => X402MiddlewareConfig | null
) {
  return async (req: X402Request, res: Response, next: NextFunction) => {
    const config = getConfig(req);

    if (!config) {
      // No payment required for this request
      return next();
    }

    // Use standard middleware with dynamic config
    const middleware = x402Middleware(config);
    return middleware(req, res, next);
  };
}

/**
 * Route-based payment configuration
 */
export interface RoutePaymentConfig {
  [routePattern: string]: Omit<X402MiddlewareConfig, 'facilitator'>;
}

/**
 * Multi-route payment middleware
 *
 * Configure payments for multiple routes at once.
 *
 * Usage:
 * ```typescript
 * app.use(x402RouterMiddleware({
 *   'GET /api/weather': { price: '0.005', network: 'base-sepolia', recipient: '0x...' },
 *   'GET /api/crypto': { price: '0.003', network: 'base-sepolia', recipient: '0x...' },
 *   'POST /api/analyze': { price: '0.01', network: 'base-sepolia', recipient: '0x...' },
 * }));
 * ```
 */
export function x402RouterMiddleware(
  routes: RoutePaymentConfig,
  facilitator?: X402Facilitator
) {
  const fac = facilitator || getDefaultFacilitator();

  return async (req: X402Request, res: Response, next: NextFunction) => {
    // Find matching route
    const routeKey = `${req.method} ${req.path}`;
    let config = routes[routeKey];

    // Try pattern matching
    if (!config) {
      for (const [pattern, cfg] of Object.entries(routes)) {
        const [method, path] = pattern.split(' ');
        if (method === req.method && matchPath(path, req.path)) {
          config = cfg;
          break;
        }
      }
    }

    if (!config) {
      // No payment required for this route
      return next();
    }

    // Apply x402 middleware
    const middleware = x402Middleware({ ...config, facilitator: fac });
    return middleware(req, res, next);
  };
}

/**
 * Simple path matching (supports :param and * wildcards)
 */
function matchPath(pattern: string, path: string): boolean {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');

  if (patternParts.length !== pathParts.length) {
    // Check for trailing wildcard
    if (patternParts[patternParts.length - 1] !== '*') {
      return false;
    }
    patternParts.pop();
    if (pathParts.length < patternParts.length) {
      return false;
    }
  }

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const pathPart = pathParts[i];

    if (patternPart.startsWith(':')) {
      // Parameter - matches anything
      continue;
    }

    if (patternPart === '*') {
      // Wildcard - matches rest
      return true;
    }

    if (patternPart !== pathPart) {
      return false;
    }
  }

  return true;
}

/**
 * Helper to check if request has valid payment
 */
export function hasValidPayment(req: X402Request): boolean {
  return req.x402Payment?.verified === true;
}

/**
 * Helper to get payment details from request
 */
export function getPaymentDetails(req: X402Request): X402Request['x402Payment'] {
  return req.x402Payment;
}
