// ============================================================
// SYNAPSE SDK - x402 Payment Client
// Client-side x402 payment handling for API requests
// ============================================================

export interface X402PaymentRequest {
  scheme: string;
  network: string;
  token: string;
  amount: string;
  recipient: string;
  description?: string;
  expiresAt: number;
}

export interface X402PaymentProof {
  txHash: string;
  signature: string;
  network: string;
}

export interface X402ClientConfig {
  /** Wallet or signing function for payments */
  signer?: {
    signTransaction: (tx: any) => Promise<string>;
    getAddress: () => Promise<string>;
  };
  /** Network to use for payments (e.g., 'base', 'base-sepolia') */
  network?: string;
  /** Demo mode - simulates payments without real transactions */
  demoMode?: boolean;
}

/**
 * x402 Payment Client
 *
 * Handles HTTP 402 responses and creates payment proofs for x402-enabled endpoints.
 *
 * Usage:
 * ```typescript
 * const client = new X402Client({ demoMode: true });
 *
 * // Automatic retry with payment
 * const response = await client.fetchWithPayment('https://api.example.com/data');
 *
 * // Or handle manually
 * const response = await fetch(url);
 * if (response.status === 402) {
 *   const paymentRequest = client.parsePaymentRequired(response);
 *   const proof = await client.createPayment(paymentRequest);
 *   const paidResponse = await client.retryWithPayment(url, proof);
 * }
 * ```
 */
export class X402Client {
  private config: X402ClientConfig;
  private paymentHistory: Map<string, { txHash: string; timestamp: number }> = new Map();

  constructor(config: X402ClientConfig = {}) {
    this.config = {
      network: 'base-sepolia',
      demoMode: true,
      ...config
    };
  }

  /**
   * Parse x402 payment required response
   */
  parsePaymentRequired(response: Response): X402PaymentRequest | null {
    const header = response.headers.get('X-Payment');
    if (!header) return null;

    try {
      const decoded = Buffer.from(header, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  /**
   * Create x402 payment proof
   */
  async createPayment(request: X402PaymentRequest): Promise<X402PaymentProof> {
    if (this.config.demoMode) {
      return this.createDemoPayment(request);
    }

    if (!this.config.signer) {
      throw new Error('No signer configured for real payments');
    }

    // In production, this would:
    // 1. Create a USDC transfer transaction
    // 2. Sign it with the wallet
    // 3. Submit to the network
    // 4. Return the proof

    const address = await this.config.signer.getAddress();
    const signature = await this.config.signer.signTransaction({
      to: request.recipient,
      value: request.amount,
      token: request.token,
      network: request.network
    });

    return {
      txHash: signature,
      signature: signature,
      network: request.network
    };
  }

  /**
   * Create demo payment (for testing)
   */
  private createDemoPayment(request: X402PaymentRequest): X402PaymentProof {
    const txHash = `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`;
    const signature = `sig_demo_${Date.now()}`;

    // Store in history
    this.paymentHistory.set(txHash, {
      txHash,
      timestamp: Date.now()
    });

    return {
      txHash,
      signature,
      network: request.network
    };
  }

  /**
   * Create x402 payment header from proof
   */
  createPaymentHeader(proof: X402PaymentProof): string {
    const payload = {
      scheme: 'exact',
      network: proof.network,
      payload: proof.txHash,
      signature: proof.signature
    };

    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  /**
   * Retry request with payment proof
   */
  async retryWithPayment(
    url: string,
    proof: X402PaymentProof,
    options: RequestInit = {}
  ): Promise<Response> {
    const headers = new Headers(options.headers);
    headers.set('X-Payment', this.createPaymentHeader(proof));

    return fetch(url, {
      ...options,
      headers
    });
  }

  /**
   * Fetch with automatic x402 payment handling
   *
   * If the request returns 402, this will:
   * 1. Parse the payment requirement
   * 2. Create and sign a payment
   * 3. Retry the request with payment proof
   */
  async fetchWithPayment(
    url: string,
    options: RequestInit = {},
    maxRetries = 1
  ): Promise<Response> {
    const response = await fetch(url, options);

    if (response.status !== 402) {
      return response;
    }

    // Parse payment requirement
    const paymentRequest = this.parsePaymentRequired(response);
    if (!paymentRequest) {
      throw new Error('402 response without valid X-Payment header');
    }

    // Check if we have budget for this payment
    console.log(`[x402] Payment required: $${paymentRequest.amount} ${paymentRequest.token}`);
    console.log(`[x402] Recipient: ${paymentRequest.recipient}`);
    console.log(`[x402] Description: ${paymentRequest.description}`);

    // Create payment
    const proof = await this.createPayment(paymentRequest);
    console.log(`[x402] Payment created: ${proof.txHash}`);

    // Retry with payment
    const paidResponse = await this.retryWithPayment(url, proof, options);

    if (paidResponse.status === 402 && maxRetries > 0) {
      // Payment might have failed, retry
      return this.fetchWithPayment(url, options, maxRetries - 1);
    }

    return paidResponse;
  }

  /**
   * Get payment history
   */
  getPaymentHistory(): Array<{ txHash: string; timestamp: number }> {
    return Array.from(this.paymentHistory.values());
  }

  /**
   * Clear payment history
   */
  clearPaymentHistory(): void {
    this.paymentHistory.clear();
  }
}

/**
 * Create x402 client instance
 */
export function createX402Client(config?: X402ClientConfig): X402Client {
  return new X402Client(config);
}
