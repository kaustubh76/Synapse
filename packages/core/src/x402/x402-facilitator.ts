// ============================================================
// SYNAPSE x402 Facilitator
// Production-ready x402 facilitator with thirdweb integration
// ============================================================

import { EventEmitter } from 'eventemitter3';
import {
  X402Facilitator,
  X402FacilitatorConfig,
  X402PaymentPayload,
  X402PaymentRequirements,
  X402VerificationResult,
  X402SettlementResult,
  X402Network,
  SupportedMethod,
  NETWORK_CHAIN_IDS,
  USDC_ADDRESSES,
  generateNonce,
} from './x402-types.js';

interface FacilitatorEvents {
  'payment:verified': (result: X402VerificationResult) => void;
  'payment:settled': (result: X402SettlementResult) => void;
  'payment:failed': (error: string) => void;
}

/**
 * Thirdweb x402 Facilitator
 *
 * Integrates with thirdweb's x402 facilitator service for payment verification
 * and settlement. Supports both production and demo modes.
 *
 * Usage:
 * ```typescript
 * const facilitator = createThirdwebFacilitator({
 *   secretKey: process.env.THIRDWEB_SECRET_KEY,
 *   serverWalletAddress: '0x...',
 *   defaultNetwork: 'base-sepolia',
 * });
 *
 * // Verify a payment
 * const result = await facilitator.verify(payload, requirements);
 *
 * // Settle a payment
 * const settlement = await facilitator.settle(payload, requirements);
 * ```
 */
export class ThirdwebFacilitator extends EventEmitter<FacilitatorEvents> implements X402Facilitator {
  private config: X402FacilitatorConfig;
  private baseUrl: string = 'https://x402.thirdweb.com';

  constructor(config: X402FacilitatorConfig) {
    super();
    this.config = {
      waitUntil: 'confirmed',
      demoMode: false,
      ...config,
    };
  }

  /**
   * Verify a payment payload against requirements
   */
  async verify(
    payload: X402PaymentPayload,
    requirements: X402PaymentRequirements
  ): Promise<X402VerificationResult> {
    // Demo mode - simulate verification
    if (this.config.demoMode) {
      return this.simulateVerification(payload, requirements);
    }

    try {
      const response = await fetch(`${this.baseUrl}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-secret-key': this.config.secretKey || '',
        },
        body: JSON.stringify({
          payload,
          requirements,
          serverWalletAddress: this.config.serverWalletAddress,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return {
          valid: false,
          error: `Facilitator error: ${response.status} - ${error}`,
        };
      }

      const result = await response.json();

      const verificationResult: X402VerificationResult = {
        valid: result.valid === true,
        error: result.error,
        amount: result.amount || requirements.amount,
        from: result.from || payload.authorization.from,
        to: result.to || requirements.recipient,
        token: result.token || requirements.tokenAddress,
        network: result.network || requirements.network,
      };

      this.emit('payment:verified', verificationResult);
      return verificationResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('payment:failed', errorMessage);
      return {
        valid: false,
        error: `Verification failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Settle a verified payment on-chain
   */
  async settle(
    payload: X402PaymentPayload,
    requirements: X402PaymentRequirements
  ): Promise<X402SettlementResult> {
    // Demo mode - simulate settlement
    if (this.config.demoMode) {
      return this.simulateSettlement(payload, requirements);
    }

    try {
      // First verify the payment
      const verification = await this.verify(payload, requirements);
      if (!verification.valid) {
        return {
          success: false,
          status: 'failed',
          error: verification.error || 'Payment verification failed',
        };
      }

      // Submit for settlement
      const response = await fetch(`${this.baseUrl}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-secret-key': this.config.secretKey || '',
        },
        body: JSON.stringify({
          payload,
          requirements,
          serverWalletAddress: this.config.serverWalletAddress,
          waitUntil: this.config.waitUntil,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return {
          success: false,
          status: 'failed',
          error: `Settlement failed: ${response.status} - ${error}`,
        };
      }

      const result = await response.json();

      const settlementResult: X402SettlementResult = {
        success: result.success === true,
        txHash: result.transactionHash || result.txHash,
        blockNumber: result.blockNumber,
        status: result.status || (result.success ? 'confirmed' : 'failed'),
        error: result.error,
        gasUsed: result.gasUsed,
        effectiveGasPrice: result.effectiveGasPrice,
      };

      this.emit('payment:settled', settlementResult);
      return settlementResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('payment:failed', errorMessage);
      return {
        success: false,
        status: 'failed',
        error: `Settlement error: ${errorMessage}`,
      };
    }
  }

  /**
   * Get supported payment methods
   */
  async supported(options?: {
    chainId?: number;
    tokenAddress?: string;
  }): Promise<SupportedMethod[]> {
    // In demo mode, return standard USDC on common networks
    if (this.config.demoMode) {
      return this.getDemoSupportedMethods(options);
    }

    try {
      const params = new URLSearchParams();
      if (options?.chainId) params.set('chainId', options.chainId.toString());
      if (options?.tokenAddress) params.set('tokenAddress', options.tokenAddress);

      const response = await fetch(`${this.baseUrl}/supported?${params}`, {
        headers: {
          'x-secret-key': this.config.secretKey || '',
        },
      });

      if (!response.ok) {
        console.error('[x402 Facilitator] Failed to get supported methods');
        return this.getDemoSupportedMethods(options);
      }

      const data = await response.json();
      return data.methods || [];
    } catch (error) {
      console.error('[x402 Facilitator] Error fetching supported methods:', error);
      return this.getDemoSupportedMethods(options);
    }
  }

  /**
   * Check if service is in demo mode
   */
  get isDemoMode(): boolean {
    return this.config.demoMode || false;
  }

  /**
   * Get current configuration
   */
  getConfig(): X402FacilitatorConfig {
    return { ...this.config };
  }

  // ============================================================
  // DEMO MODE SIMULATIONS
  // ============================================================

  private simulateVerification(
    payload: X402PaymentPayload,
    requirements: X402PaymentRequirements
  ): X402VerificationResult {
    // Simulate some validation logic
    const isExpired = requirements.expiresAt < Date.now();
    const hasValidSignature = payload.signature && payload.signature.length > 10;
    const amountMatches = payload.authorization.amount === requirements.amount;

    if (isExpired) {
      return { valid: false, error: 'Payment requirements expired' };
    }

    if (!hasValidSignature) {
      return { valid: false, error: 'Invalid signature' };
    }

    // In demo mode, be lenient with amount matching
    const result: X402VerificationResult = {
      valid: true,
      amount: payload.authorization.amount,
      from: payload.authorization.from,
      to: payload.authorization.to,
      token: payload.authorization.token,
      network: payload.network,
    };

    this.emit('payment:verified', result);
    return result;
  }

  private async simulateSettlement(
    payload: X402PaymentPayload,
    requirements: X402PaymentRequirements
  ): Promise<X402SettlementResult> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

    // Generate a realistic-looking transaction hash
    const txHash = `0x${Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('')}`;

    const blockNumber = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000);

    const result: X402SettlementResult = {
      success: true,
      txHash,
      blockNumber,
      status: 'confirmed',
      gasUsed: (21000 + Math.floor(Math.random() * 50000)).toString(),
      effectiveGasPrice: (1000000000 + Math.floor(Math.random() * 1000000000)).toString(),
    };

    this.emit('payment:settled', result);
    return result;
  }

  private getDemoSupportedMethods(options?: {
    chainId?: number;
    tokenAddress?: string;
  }): SupportedMethod[] {
    const networks: X402Network[] = options?.chainId
      ? [this.chainIdToNetwork(options.chainId)].filter(Boolean) as X402Network[]
      : ['base', 'base-sepolia', 'ethereum-sepolia', 'polygon-amoy'];

    return networks.map(network => ({
      network,
      chainId: NETWORK_CHAIN_IDS[network],
      tokenAddress: USDC_ADDRESSES[network],
      tokenSymbol: 'USDC',
      scheme: 'exact' as const,
    }));
  }

  private chainIdToNetwork(chainId: number): X402Network | null {
    for (const [network, id] of Object.entries(NETWORK_CHAIN_IDS)) {
      if (id === chainId) return network as X402Network;
    }
    return null;
  }
}

/**
 * Local x402 Facilitator
 *
 * Handles payment verification locally without external service.
 * Useful for development and testing.
 */
export class LocalFacilitator extends EventEmitter<FacilitatorEvents> implements X402Facilitator {
  private serverWalletAddress: string;

  constructor(serverWalletAddress: string) {
    super();
    this.serverWalletAddress = serverWalletAddress;
  }

  async verify(
    payload: X402PaymentPayload,
    requirements: X402PaymentRequirements
  ): Promise<X402VerificationResult> {
    // Basic local verification
    const isExpired = requirements.expiresAt < Date.now();
    const recipientMatches =
      payload.authorization.to.toLowerCase() === requirements.recipient.toLowerCase();
    const tokenMatches =
      payload.authorization.token.toLowerCase() === requirements.tokenAddress.toLowerCase();
    const amountSufficient =
      BigInt(payload.authorization.amount) >= BigInt(requirements.amount);

    if (isExpired) {
      return { valid: false, error: 'Payment requirements expired' };
    }
    if (!recipientMatches) {
      return { valid: false, error: 'Recipient mismatch' };
    }
    if (!tokenMatches) {
      return { valid: false, error: 'Token mismatch' };
    }
    if (!amountSufficient) {
      return { valid: false, error: 'Insufficient amount' };
    }

    return {
      valid: true,
      amount: payload.authorization.amount,
      from: payload.authorization.from,
      to: payload.authorization.to,
      token: payload.authorization.token,
      network: payload.network,
    };
  }

  async settle(
    payload: X402PaymentPayload,
    requirements: X402PaymentRequirements
  ): Promise<X402SettlementResult> {
    // Local facilitator cannot actually settle - would need blockchain access
    return {
      success: false,
      status: 'failed',
      error: 'Local facilitator cannot settle payments. Use ThirdwebFacilitator for production.',
    };
  }

  async supported(): Promise<SupportedMethod[]> {
    return [
      {
        network: 'base-sepolia',
        chainId: 84532,
        tokenAddress: USDC_ADDRESSES['base-sepolia'],
        tokenSymbol: 'USDC',
        scheme: 'exact',
      },
    ];
  }
}

// ============================================================
// FACTORY FUNCTIONS
// ============================================================

/**
 * Create a thirdweb x402 facilitator
 */
export function createThirdwebFacilitator(config: X402FacilitatorConfig): ThirdwebFacilitator {
  return new ThirdwebFacilitator(config);
}

/**
 * Create a local x402 facilitator (for testing)
 */
export function createLocalFacilitator(serverWalletAddress: string): LocalFacilitator {
  return new LocalFacilitator(serverWalletAddress);
}

/**
 * Get or create a facilitator based on environment
 */
export function getFacilitator(config?: Partial<X402FacilitatorConfig>): X402Facilitator {
  const secretKey = config?.secretKey || process.env.THIRDWEB_SECRET_KEY;
  const serverWallet = config?.serverWalletAddress || process.env.X402_SERVER_WALLET || '';
  const demoMode = config?.demoMode ?? process.env.X402_DEMO_MODE === 'true';

  if (!secretKey || demoMode) {
    console.log('[x402] Running in demo mode - payments will be simulated');
    return new ThirdwebFacilitator({
      serverWalletAddress: serverWallet || '0x0000000000000000000000000000000000000000',
      demoMode: true,
      ...config,
    });
  }

  return new ThirdwebFacilitator({
    secretKey,
    serverWalletAddress: serverWallet,
    demoMode: false,
    ...config,
  });
}

// Singleton instance
let facilitatorInstance: X402Facilitator | null = null;

export function getDefaultFacilitator(): X402Facilitator {
  if (!facilitatorInstance) {
    facilitatorInstance = getFacilitator();
  }
  return facilitatorInstance;
}

export function resetFacilitator(): void {
  facilitatorInstance = null;
}
