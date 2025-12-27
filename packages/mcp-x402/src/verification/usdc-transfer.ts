// ============================================================
// SYNAPSE USDC TRANSFER
// Execute real USDC transfers on Base Sepolia
// ============================================================

import { ethers } from 'ethers';
import { EventEmitter } from 'eventemitter3';

// -------------------- CONFIGURATION --------------------

const BASE_SEPOLIA_CONFIG = {
  chainId: 84532,
  rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
  usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  blockExplorerUrl: 'https://sepolia.basescan.org',
};

// USDC has 6 decimals
const USDC_DECIMALS = 6;

// ERC20 ABI for USDC transfer
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

// -------------------- TYPES --------------------

export interface TransferRequest {
  recipient: string;
  amount: number;       // Amount in USDC (not wei)
  reason?: string;      // Description for the transfer
  gasLimit?: bigint;    // Optional gas limit override
}

export interface TransferResult {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  gasUsed?: bigint;
  effectiveGasPrice?: bigint;
  amount: number;
  recipient: string;
  sender: string;
  explorerUrl?: string;
  error?: string;
  timestamp: number;
}

export interface WalletBalance {
  usdc: number;
  usdcWei: bigint;
  eth: number;
  ethWei: bigint;
  address: string;
}

interface USDCTransferEvents {
  'transfer:initiated': (txHash: string, amount: number, recipient: string) => void;
  'transfer:confirmed': (result: TransferResult) => void;
  'transfer:failed': (error: string, txHash?: string) => void;
}

// -------------------- USDC TRANSFER CLASS --------------------

export class USDCTransfer extends EventEmitter<USDCTransferEvents> {
  private provider: ethers.JsonRpcProvider;
  private usdcAddress: string;
  private usdcContract: ethers.Contract;

  constructor(config?: {
    rpcUrl?: string;
    usdcAddress?: string;
  }) {
    super();
    this.provider = new ethers.JsonRpcProvider(
      config?.rpcUrl || BASE_SEPOLIA_CONFIG.rpcUrl
    );
    this.usdcAddress = config?.usdcAddress || BASE_SEPOLIA_CONFIG.usdcAddress;
    this.usdcContract = new ethers.Contract(
      this.usdcAddress,
      ERC20_ABI,
      this.provider
    );
  }

  // -------------------- BALANCE QUERIES --------------------

  /**
   * Get USDC balance for an address
   */
  async getUSDCBalance(address: string): Promise<number> {
    const balance = await this.usdcContract.balanceOf(address);
    return Number(balance) / Math.pow(10, USDC_DECIMALS);
  }

  /**
   * Get ETH balance for an address
   */
  async getETHBalance(address: string): Promise<number> {
    const balance = await this.provider.getBalance(address);
    return Number(balance) / 1e18;
  }

  /**
   * Get full wallet balance info
   */
  async getWalletBalance(address: string): Promise<WalletBalance> {
    const [usdcWei, ethWei] = await Promise.all([
      this.usdcContract.balanceOf(address) as Promise<bigint>,
      this.provider.getBalance(address),
    ]);

    return {
      usdc: Number(usdcWei) / Math.pow(10, USDC_DECIMALS),
      usdcWei,
      eth: Number(ethWei) / 1e18,
      ethWei,
      address,
    };
  }

  // -------------------- TRANSFER EXECUTION --------------------

  /**
   * Execute a USDC transfer using a wallet/signer
   */
  async transfer(
    signer: ethers.Wallet | ethers.Signer,
    request: TransferRequest
  ): Promise<TransferResult> {
    const timestamp = Date.now();
    const sender = await signer.getAddress();

    try {
      // Validate recipient address
      if (!ethers.isAddress(request.recipient)) {
        throw new Error(`Invalid recipient address: ${request.recipient}`);
      }

      // Validate amount
      if (request.amount <= 0) {
        throw new Error(`Invalid amount: ${request.amount}`);
      }

      // Convert amount to wei (6 decimals for USDC)
      const amountWei = this.usdcToWei(request.amount);

      // Check sender balance
      const balance = await this.getUSDCBalance(sender);
      if (balance < request.amount) {
        throw new Error(`Insufficient USDC balance: ${balance} < ${request.amount}`);
      }

      // Check ETH for gas
      const ethBalance = await this.getETHBalance(sender);
      if (ethBalance < 0.0001) {
        throw new Error(`Insufficient ETH for gas: ${ethBalance} ETH`);
      }

      // Create contract instance with signer
      const connectedContract = new ethers.Contract(
        this.usdcAddress,
        ERC20_ABI,
        signer
      );

      // Estimate gas
      const gasEstimate = await connectedContract.getFunction('transfer').estimateGas(
        request.recipient,
        amountWei
      );

      // Get gas price
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice || BigInt(1e9);

      console.log(`[USDC Transfer] Sending ${request.amount} USDC from ${sender} to ${request.recipient}`);
      console.log(`[USDC Transfer] Gas estimate: ${gasEstimate}, Gas price: ${gasPrice}`);

      // Execute transfer
      const tx = await connectedContract.getFunction('transfer')(
        request.recipient,
        amountWei,
        {
          gasLimit: request.gasLimit || gasEstimate * BigInt(12) / BigInt(10), // 20% buffer
        }
      );

      this.emit('transfer:initiated', tx.hash, request.amount, request.recipient);
      console.log(`[USDC Transfer] Transaction submitted: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();

      if (!receipt || receipt.status !== 1) {
        const error = 'Transaction failed on-chain';
        this.emit('transfer:failed', error, tx.hash);
        return {
          success: false,
          txHash: tx.hash,
          amount: request.amount,
          recipient: request.recipient,
          sender,
          error,
          timestamp,
        };
      }

      const result: TransferResult = {
        success: true,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        effectiveGasPrice: receipt.gasPrice,
        amount: request.amount,
        recipient: request.recipient,
        sender,
        explorerUrl: `${BASE_SEPOLIA_CONFIG.blockExplorerUrl}/tx/${tx.hash}`,
        timestamp,
      };

      this.emit('transfer:confirmed', result);
      console.log(`[USDC Transfer] Confirmed in block ${receipt.blockNumber}`);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('transfer:failed', errorMessage);

      return {
        success: false,
        amount: request.amount,
        recipient: request.recipient,
        sender,
        error: errorMessage,
        timestamp,
      };
    }
  }

  /**
   * Execute transfer using a private key
   */
  async transferWithPrivateKey(
    privateKey: string,
    request: TransferRequest
  ): Promise<TransferResult> {
    const wallet = new ethers.Wallet(privateKey, this.provider);
    return this.transfer(wallet, request);
  }

  // -------------------- BATCH TRANSFERS --------------------

  /**
   * Execute multiple transfers sequentially
   */
  async batchTransfer(
    signer: ethers.Wallet | ethers.Signer,
    requests: TransferRequest[]
  ): Promise<TransferResult[]> {
    const results: TransferResult[] = [];

    for (const request of requests) {
      const result = await this.transfer(signer, request);
      results.push(result);

      // If a transfer fails, continue with others but log warning
      if (!result.success) {
        console.warn(`[USDC Transfer] Batch transfer failed for ${request.recipient}: ${result.error}`);
      }

      // Small delay between transfers
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return results;
  }

  // -------------------- HELPER METHODS --------------------

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
   * Get explorer URL for a transaction
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
   * Check if an address is valid
   */
  isValidAddress(address: string): boolean {
    return ethers.isAddress(address);
  }

  /**
   * Create a wallet from private key
   */
  createWallet(privateKey: string): ethers.Wallet {
    return new ethers.Wallet(privateKey, this.provider);
  }

  /**
   * Generate a new random wallet
   */
  generateWallet(): ethers.HDNodeWallet {
    const wallet = ethers.Wallet.createRandom();
    return wallet.connect(this.provider) as ethers.HDNodeWallet;
  }

  /**
   * Get current gas price
   */
  async getGasPrice(): Promise<bigint> {
    const feeData = await this.provider.getFeeData();
    return feeData.gasPrice || BigInt(1e9);
  }

  /**
   * Estimate transfer gas cost in ETH
   */
  async estimateTransferCost(): Promise<number> {
    const gasPrice = await this.getGasPrice();
    const estimatedGas = BigInt(65000); // Typical ERC20 transfer gas
    const costWei = gasPrice * estimatedGas;
    return Number(costWei) / 1e18;
  }
}

// -------------------- SINGLETON --------------------

let transferInstance: USDCTransfer | null = null;

export function getUSDCTransfer(config?: {
  rpcUrl?: string;
  usdcAddress?: string;
}): USDCTransfer {
  if (!transferInstance) {
    transferInstance = new USDCTransfer(config);
  }
  return transferInstance;
}

export function resetUSDCTransfer(): void {
  transferInstance = null;
}

// -------------------- EXPORTS --------------------

export { BASE_SEPOLIA_CONFIG as USDC_CONFIG, USDC_DECIMALS, ERC20_ABI };
