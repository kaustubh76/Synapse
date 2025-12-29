// ============================================================
// EIGEN WALLET SERVICE
// Wallet integration for USDC transactions with EigenCloud
// ============================================================

import { ethers } from 'ethers';
import { EventEmitter } from 'eventemitter3';
import { USDCTransfer, getUSDCTransfer, TransferResult, TransferRequest } from './usdc-transfer.js';

// -------------------- CONFIGURATION --------------------

// Function to get config at runtime (not module load time)
function getEigenWalletConfig() {
  return {
    // Default EigenCloud wallet from .env.example
    defaultAddress: process.env.EIGENCLOUD_WALLET_ADDRESS || '0xcF1A4587a4470634fc950270cab298B79b258eDe',
    // Private key for signing (must be set in environment for real transactions)
    // Support both env var names for compatibility
    privateKey: process.env.EIGEN_WALLET_PRIVATE_KEY || process.env.EIGENCLOUD_PRIVATE_KEY || '',
    // Platform wallet for receiving payments
    platformWallet: process.env.SYNAPSE_PLATFORM_WALLET || process.env.PLATFORM_WALLET || '0x742d35Cc6634c0532925A3b844BC9e7595F5bE21',
    // RPC URL
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
  };
}

// Keep for backwards compatibility but prefer getEigenWalletConfig() for runtime access
const EIGEN_WALLET_CONFIG = getEigenWalletConfig();

// -------------------- TYPES --------------------

export interface EigenWalletConfig {
  privateKey?: string;
  address?: string;
  rpcUrl?: string;
}

export interface PaymentRequest {
  recipient: string;
  amount: number;
  resource: string;
  reason?: string;
}

export interface PaymentResult {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  amount: number;
  recipient: string;
  sender: string;
  explorerUrl?: string;
  error?: string;
  timestamp: number;
}

interface EigenWalletEvents {
  'wallet:ready': (address: string) => void;
  'payment:initiated': (txHash: string, amount: number, recipient: string) => void;
  'payment:confirmed': (result: PaymentResult) => void;
  'payment:failed': (error: string) => void;
}

// -------------------- EIGEN WALLET SERVICE --------------------

export class EigenWallet extends EventEmitter<EigenWalletEvents> {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet | null = null;
  private usdcTransfer: USDCTransfer;
  private _address: string;
  private _isConfigured: boolean = false;

  constructor(config?: EigenWalletConfig) {
    super();

    // Get config at runtime (after dotenv has loaded)
    const runtimeConfig = getEigenWalletConfig();

    const rpcUrl = config?.rpcUrl || runtimeConfig.rpcUrl;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.usdcTransfer = getUSDCTransfer({ rpcUrl });

    // Try to initialize wallet from private key
    const privateKey = config?.privateKey || runtimeConfig.privateKey;

    if (privateKey && privateKey.length > 0) {
      try {
        this.wallet = new ethers.Wallet(privateKey, this.provider);
        this._address = this.wallet.address;
        this._isConfigured = true;
        console.log(`[EigenWallet] Configured with address: ${this._address}`);
        this.emit('wallet:ready', this._address);
      } catch (error) {
        console.warn('[EigenWallet] Invalid private key, running in read-only mode');
        this._address = config?.address || runtimeConfig.defaultAddress;
        this._isConfigured = false;
      }
    } else {
      // Read-only mode - can check balances but not sign transactions
      this._address = config?.address || runtimeConfig.defaultAddress;
      this._isConfigured = false;
      console.log(`[EigenWallet] Running in read-only mode (no private key). Address: ${this._address}`);
    }
  }

  // -------------------- PROPERTIES --------------------

  get address(): string {
    return this._address;
  }

  get isConfigured(): boolean {
    return this._isConfigured;
  }

  get canSign(): boolean {
    return this.wallet !== null;
  }

  // -------------------- BALANCE QUERIES --------------------

  /**
   * Get USDC balance
   */
  async getUSDCBalance(): Promise<number> {
    return this.usdcTransfer.getUSDCBalance(this._address);
  }

  /**
   * Get ETH balance (for gas)
   */
  async getETHBalance(): Promise<number> {
    const balance = await this.provider.getBalance(this._address);
    return Number(balance) / 1e18;
  }

  /**
   * Get full wallet balance info
   */
  async getBalance(): Promise<{
    usdc: number;
    eth: number;
    address: string;
    canTransfer: boolean;
    hasGas: boolean;
  }> {
    const [usdc, eth] = await Promise.all([
      this.getUSDCBalance(),
      this.getETHBalance(),
    ]);

    const hasGas = eth >= 0.0001;
    const canTransfer = this._isConfigured && usdc > 0 && hasGas;

    return {
      usdc,
      eth,
      address: this._address,
      canTransfer,
      hasGas,
    };
  }

  // -------------------- PAYMENT EXECUTION --------------------

  /**
   * Execute a USDC payment
   */
  async pay(request: PaymentRequest): Promise<PaymentResult> {
    const timestamp = Date.now();

    if (!this.wallet) {
      return {
        success: false,
        amount: request.amount,
        recipient: request.recipient,
        sender: this._address,
        error: 'Wallet not configured. Set EIGEN_WALLET_PRIVATE_KEY environment variable.',
        timestamp,
      };
    }

    try {
      console.log(`[EigenWallet] Initiating payment of ${request.amount} USDC to ${request.recipient}`);
      console.log(`[EigenWallet] Resource: ${request.resource}`);

      const transferRequest: TransferRequest = {
        recipient: request.recipient,
        amount: request.amount,
        reason: request.reason || `Payment for ${request.resource}`,
      };

      const result = await this.usdcTransfer.transfer(this.wallet, transferRequest);

      if (result.success) {
        this.emit('payment:initiated', result.txHash!, request.amount, request.recipient);

        const paymentResult: PaymentResult = {
          success: true,
          txHash: result.txHash,
          blockNumber: result.blockNumber,
          amount: result.amount,
          recipient: result.recipient,
          sender: result.sender,
          explorerUrl: result.explorerUrl,
          timestamp,
        };

        this.emit('payment:confirmed', paymentResult);
        return paymentResult;
      } else {
        this.emit('payment:failed', result.error || 'Transfer failed');
        return {
          success: false,
          amount: request.amount,
          recipient: request.recipient,
          sender: this._address,
          error: result.error,
          timestamp,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('payment:failed', errorMessage);

      return {
        success: false,
        amount: request.amount,
        recipient: request.recipient,
        sender: this._address,
        error: errorMessage,
        timestamp,
      };
    }
  }

  /**
   * Pay to platform wallet (convenience method)
   */
  async payToPlatform(amount: number, resource: string): Promise<PaymentResult> {
    return this.pay({
      recipient: EIGEN_WALLET_CONFIG.platformWallet,
      amount,
      resource,
      reason: `Synapse payment for ${resource}`,
    });
  }

  /**
   * Execute batch payments
   */
  async batchPay(requests: PaymentRequest[]): Promise<PaymentResult[]> {
    const results: PaymentResult[] = [];

    for (const request of requests) {
      const result = await this.pay(request);
      results.push(result);

      if (!result.success) {
        console.warn(`[EigenWallet] Batch payment failed for ${request.recipient}: ${result.error}`);
      }

      // Small delay between payments
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return results;
  }

  // -------------------- HELPER METHODS --------------------

  /**
   * Check if an address is valid
   */
  isValidAddress(address: string): boolean {
    return ethers.isAddress(address);
  }

  /**
   * Get platform wallet address
   */
  getPlatformWallet(): string {
    return EIGEN_WALLET_CONFIG.platformWallet;
  }

  /**
   * Estimate gas cost for a payment
   */
  async estimatePaymentCost(): Promise<{
    gasPriceGwei: number;
    estimatedCostEth: number;
    estimatedCostUsd: number;
  }> {
    const gasPrice = await this.usdcTransfer.getGasPrice();
    const estimatedCostEth = await this.usdcTransfer.estimateTransferCost();

    return {
      gasPriceGwei: Number(gasPrice) / 1e9,
      estimatedCostEth,
      estimatedCostUsd: estimatedCostEth * 2000, // Rough ETH price
    };
  }

  /**
   * Get explorer URL for a transaction
   */
  getExplorerUrl(txHash: string): string {
    return this.usdcTransfer.getExplorerUrl(txHash);
  }
}

// -------------------- SINGLETON --------------------

let eigenWalletInstance: EigenWallet | null = null;

export function getEigenWallet(config?: EigenWalletConfig): EigenWallet {
  if (!eigenWalletInstance) {
    eigenWalletInstance = new EigenWallet(config);
  }
  return eigenWalletInstance;
}

export function resetEigenWallet(): void {
  eigenWalletInstance = null;
}

// -------------------- EXPORTS --------------------

export { EIGEN_WALLET_CONFIG };
