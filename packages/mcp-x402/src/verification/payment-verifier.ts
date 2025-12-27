// ============================================================
// SYNAPSE PAYMENT VERIFIER
// Verifies USDC payments on Base Sepolia blockchain
// ============================================================

import { ethers } from 'ethers';
import { EventEmitter } from 'eventemitter3';

// -------------------- CONFIGURATION --------------------

// Base Sepolia Configuration
const BASE_SEPOLIA_CONFIG = {
  chainId: 84532,
  rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
  usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  blockExplorerUrl: 'https://sepolia.basescan.org',
};

// USDC ERC20 Transfer event signature
const TRANSFER_EVENT_SIGNATURE = ethers.id('Transfer(address,address,uint256)');

// USDC has 6 decimals
const USDC_DECIMALS = 6;

// -------------------- TYPES --------------------

export interface PaymentExpectation {
  amount: number;           // Amount in USDC (not wei)
  recipient: string;        // Expected recipient address
  sender?: string;          // Optional: expected sender address
  tolerance?: number;       // Optional: acceptable percentage difference (default 0.1%)
}

export interface VerificationResult {
  verified: boolean;
  txHash: string;
  blockNumber?: number;
  blockTimestamp?: number;
  actualAmount?: number;
  actualSender?: string;
  actualRecipient?: string;
  gasUsed?: bigint;
  confirmations?: number;
  error?: string;
  details?: {
    expectedAmount: number;
    amountDifference: number;
    recipientMatch: boolean;
    senderMatch?: boolean;
  };
}

export interface TransactionDetails {
  hash: string;
  blockNumber: number;
  blockTimestamp: number;
  from: string;
  to: string;
  value: bigint;
  gasUsed: bigint;
  status: 'success' | 'failed' | 'pending';
  logs: TransferLog[];
}

export interface TransferLog {
  address: string;
  from: string;
  to: string;
  amount: bigint;
  amountUSDC: number;
}

interface PaymentVerifierEvents {
  'verification:started': (txHash: string) => void;
  'verification:completed': (result: VerificationResult) => void;
  'verification:failed': (txHash: string, error: string) => void;
}

// -------------------- PAYMENT VERIFIER --------------------

export class PaymentVerifier extends EventEmitter<PaymentVerifierEvents> {
  private provider: ethers.JsonRpcProvider;
  private usdcAddress: string;
  private cache: Map<string, VerificationResult> = new Map();
  private cacheTTL: number = 5 * 60 * 1000; // 5 minutes

  constructor(config?: {
    rpcUrl?: string;
    usdcAddress?: string;
    cacheTTL?: number;
  }) {
    super();
    this.provider = new ethers.JsonRpcProvider(
      config?.rpcUrl || BASE_SEPOLIA_CONFIG.rpcUrl
    );
    this.usdcAddress = (config?.usdcAddress || BASE_SEPOLIA_CONFIG.usdcAddress).toLowerCase();
    if (config?.cacheTTL) {
      this.cacheTTL = config.cacheTTL;
    }
  }

  // -------------------- MAIN VERIFICATION METHOD --------------------

  /**
   * Verify a USDC payment transaction
   * @param txHash Transaction hash to verify
   * @param expected Expected payment details
   * @returns Verification result
   */
  async verifyPayment(
    txHash: string,
    expected: PaymentExpectation
  ): Promise<VerificationResult> {
    // Normalize tx hash
    const normalizedHash = txHash.toLowerCase();

    // Check cache first
    const cached = this.cache.get(normalizedHash);
    if (cached && cached.verified) {
      return cached;
    }

    this.emit('verification:started', txHash);

    try {
      // Get transaction receipt
      const receipt = await this.provider.getTransactionReceipt(txHash);

      if (!receipt) {
        const result: VerificationResult = {
          verified: false,
          txHash,
          error: 'Transaction not found or still pending',
        };
        this.emit('verification:failed', txHash, result.error!);
        return result;
      }

      // Check if transaction was successful
      if (receipt.status !== 1) {
        const result: VerificationResult = {
          verified: false,
          txHash,
          blockNumber: receipt.blockNumber,
          error: 'Transaction failed on-chain',
        };
        this.emit('verification:failed', txHash, result.error!);
        return result;
      }

      // Find USDC Transfer event
      const transferLog = this.findUSDCTransferLog(receipt.logs);

      if (!transferLog) {
        const result: VerificationResult = {
          verified: false,
          txHash,
          blockNumber: receipt.blockNumber,
          error: 'No USDC transfer found in transaction',
        };
        this.emit('verification:failed', txHash, result.error!);
        return result;
      }

      // Get block for timestamp
      const block = await this.provider.getBlock(receipt.blockNumber);
      const currentBlock = await this.provider.getBlockNumber();
      const confirmations = currentBlock - receipt.blockNumber;

      // Verify payment details
      const tolerance = expected.tolerance ?? 0.001; // 0.1% default tolerance
      const amountDifference = Math.abs(transferLog.amountUSDC - expected.amount);
      const amountMatch = amountDifference <= (expected.amount * tolerance);
      const recipientMatch = transferLog.to.toLowerCase() === expected.recipient.toLowerCase();
      const senderMatch = expected.sender
        ? transferLog.from.toLowerCase() === expected.sender.toLowerCase()
        : true;

      const verified = amountMatch && recipientMatch && senderMatch;

      const result: VerificationResult = {
        verified,
        txHash,
        blockNumber: receipt.blockNumber,
        blockTimestamp: block?.timestamp,
        actualAmount: transferLog.amountUSDC,
        actualSender: transferLog.from,
        actualRecipient: transferLog.to,
        gasUsed: receipt.gasUsed,
        confirmations,
        details: {
          expectedAmount: expected.amount,
          amountDifference,
          recipientMatch,
          senderMatch: expected.sender ? senderMatch : undefined,
        },
      };

      if (!verified) {
        const reasons: string[] = [];
        if (!amountMatch) reasons.push(`Amount mismatch: expected ${expected.amount}, got ${transferLog.amountUSDC}`);
        if (!recipientMatch) reasons.push(`Recipient mismatch: expected ${expected.recipient}, got ${transferLog.to}`);
        if (!senderMatch) reasons.push(`Sender mismatch: expected ${expected.sender}, got ${transferLog.from}`);
        result.error = reasons.join('; ');
        this.emit('verification:failed', txHash, result.error);
      } else {
        // Cache successful verifications
        this.cache.set(normalizedHash, result);
        setTimeout(() => this.cache.delete(normalizedHash), this.cacheTTL);
        this.emit('verification:completed', result);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const result: VerificationResult = {
        verified: false,
        txHash,
        error: `Verification error: ${errorMessage}`,
      };
      this.emit('verification:failed', txHash, result.error!);
      return result;
    }
  }

  // -------------------- TRANSACTION DETAILS --------------------

  /**
   * Get detailed information about a transaction
   */
  async getTransactionDetails(txHash: string): Promise<TransactionDetails | null> {
    try {
      const [tx, receipt] = await Promise.all([
        this.provider.getTransaction(txHash),
        this.provider.getTransactionReceipt(txHash),
      ]);

      if (!tx || !receipt) {
        return null;
      }

      const block = await this.provider.getBlock(receipt.blockNumber);

      // Parse all USDC transfer logs
      const transferLogs = receipt.logs
        .filter(log =>
          log.address.toLowerCase() === this.usdcAddress &&
          log.topics[0] === TRANSFER_EVENT_SIGNATURE
        )
        .map(log => this.parseTransferLog(log));

      return {
        hash: txHash,
        blockNumber: receipt.blockNumber,
        blockTimestamp: block?.timestamp || 0,
        from: tx.from,
        to: tx.to || '',
        value: tx.value,
        gasUsed: receipt.gasUsed,
        status: receipt.status === 1 ? 'success' : 'failed',
        logs: transferLogs,
      };
    } catch {
      return null;
    }
  }

  // -------------------- BATCH VERIFICATION --------------------

  /**
   * Verify multiple payments in parallel
   */
  async verifyPayments(
    payments: Array<{ txHash: string; expected: PaymentExpectation }>
  ): Promise<Map<string, VerificationResult>> {
    const results = new Map<string, VerificationResult>();

    const verifications = await Promise.allSettled(
      payments.map(async ({ txHash, expected }) => {
        const result = await this.verifyPayment(txHash, expected);
        return { txHash, result };
      })
    );

    for (const verification of verifications) {
      if (verification.status === 'fulfilled') {
        results.set(verification.value.txHash, verification.value.result);
      } else {
        results.set('unknown', {
          verified: false,
          txHash: 'unknown',
          error: verification.reason?.message || 'Verification failed',
        });
      }
    }

    return results;
  }

  // -------------------- WAIT FOR CONFIRMATION --------------------

  /**
   * Wait for a transaction to be confirmed with a minimum number of confirmations
   */
  async waitForConfirmation(
    txHash: string,
    minConfirmations: number = 1,
    timeout: number = 120000 // 2 minutes default
  ): Promise<VerificationResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const receipt = await this.provider.getTransactionReceipt(txHash);

        if (receipt) {
          const currentBlock = await this.provider.getBlockNumber();
          const confirmations = currentBlock - receipt.blockNumber;

          if (confirmations >= minConfirmations) {
            // Return basic verification (caller should use verifyPayment for full verification)
            return {
              verified: receipt.status === 1,
              txHash,
              blockNumber: receipt.blockNumber,
              confirmations,
            };
          }
        }

        // Wait 2 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch {
        // Continue waiting
      }
    }

    return {
      verified: false,
      txHash,
      error: `Timeout waiting for ${minConfirmations} confirmations`,
    };
  }

  // -------------------- HELPER METHODS --------------------

  /**
   * Find USDC Transfer log in transaction logs
   */
  private findUSDCTransferLog(logs: readonly ethers.Log[]): TransferLog | null {
    for (const log of logs) {
      if (
        log.address.toLowerCase() === this.usdcAddress &&
        log.topics[0] === TRANSFER_EVENT_SIGNATURE
      ) {
        return this.parseTransferLog(log);
      }
    }
    return null;
  }

  /**
   * Parse Transfer event log
   */
  private parseTransferLog(log: ethers.Log): TransferLog {
    // Transfer(address indexed from, address indexed to, uint256 value)
    const from = ethers.getAddress('0x' + log.topics[1].slice(26));
    const to = ethers.getAddress('0x' + log.topics[2].slice(26));
    const amount = BigInt(log.data);
    const amountUSDC = Number(amount) / Math.pow(10, USDC_DECIMALS);

    return {
      address: log.address,
      from,
      to,
      amount,
      amountUSDC,
    };
  }

  /**
   * Get the current block number
   */
  async getCurrentBlock(): Promise<number> {
    return this.provider.getBlockNumber();
  }

  /**
   * Check if an address is valid
   */
  isValidAddress(address: string): boolean {
    try {
      ethers.getAddress(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Convert USDC amount to wei (6 decimals)
   */
  usdcToWei(amount: number): bigint {
    return BigInt(Math.round(amount * Math.pow(10, USDC_DECIMALS)));
  }

  /**
   * Convert wei to USDC amount
   */
  weiToUsdc(wei: bigint): number {
    return Number(wei) / Math.pow(10, USDC_DECIMALS);
  }

  /**
   * Get block explorer URL for a transaction
   */
  getExplorerUrl(txHash: string): string {
    return `${BASE_SEPOLIA_CONFIG.blockExplorerUrl}/tx/${txHash}`;
  }

  /**
   * Get USDC contract address
   */
  getUSDCAddress(): string {
    return this.usdcAddress;
  }

  /**
   * Clear verification cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// -------------------- SINGLETON --------------------

let verifierInstance: PaymentVerifier | null = null;

export function getPaymentVerifier(config?: {
  rpcUrl?: string;
  usdcAddress?: string;
  cacheTTL?: number;
}): PaymentVerifier {
  if (!verifierInstance) {
    verifierInstance = new PaymentVerifier(config);
  }
  return verifierInstance;
}

export function resetPaymentVerifier(): void {
  if (verifierInstance) {
    verifierInstance.clearCache();
    verifierInstance = null;
  }
}

// -------------------- EXPORTS --------------------

export { BASE_SEPOLIA_CONFIG, USDC_DECIMALS };
