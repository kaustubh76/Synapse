// ============================================================
// PAYMENT CHANNELS - Efficient Micropayments for Agent Economy
// Revolutionary: 1000s of payments with only 2 on-chain transactions
// ============================================================

import { EventEmitter } from 'eventemitter3';
import { X402Network, CHAIN_IDS, USDC_ADDRESSES, generateNonce } from '../types.js';

/**
 * Payment channel state
 */
export type ChannelState = 'opening' | 'open' | 'closing' | 'closed' | 'disputed';

/**
 * Channel payment record
 */
export interface ChannelPayment {
  /** Payment ID */
  id: string;
  /** Sequence number (for ordering) */
  sequence: number;
  /** Amount of this payment */
  amount: string;
  /** Cumulative amount (total sent in channel so far) */
  cumulativeAmount: string;
  /** Resource/tool being paid for */
  resource: string;
  /** Timestamp */
  timestamp: number;
  /** Signature from payer */
  signature: string;
}

/**
 * Channel configuration
 */
export interface ChannelConfig {
  /** Network */
  network: X402Network;
  /** Sender address */
  sender: string;
  /** Recipient address */
  recipient: string;
  /** Initial deposit amount (USDC) */
  depositAmount: string;
  /** Channel duration in seconds (default: 24 hours) */
  duration?: number;
  /** Dispute period in seconds (default: 1 hour) */
  disputePeriod?: number;
}

/**
 * Channel info
 */
export interface ChannelInfo {
  /** Channel ID */
  id: string;
  /** Current state */
  state: ChannelState;
  /** Sender address */
  sender: string;
  /** Recipient address */
  recipient: string;
  /** Network */
  network: X402Network;
  /** Total deposit */
  deposit: string;
  /** Amount spent so far */
  spent: string;
  /** Amount remaining */
  remaining: string;
  /** Number of payments made */
  paymentCount: number;
  /** Channel expiry timestamp */
  expiresAt: number;
  /** Created timestamp */
  createdAt: number;
  /** Opening transaction hash */
  openTxHash?: string;
  /** Closing transaction hash */
  closeTxHash?: string;
}

/**
 * Channel events
 */
export interface ChannelEvents {
  /** Channel opened */
  'channel:opened': (info: ChannelInfo) => void;
  /** Payment made */
  'payment:made': (payment: ChannelPayment) => void;
  /** Channel closing */
  'channel:closing': (info: ChannelInfo) => void;
  /** Channel closed */
  'channel:closed': (info: ChannelInfo, finalAmount: string) => void;
  /** Dispute raised */
  'channel:disputed': (info: ChannelInfo, reason: string) => void;
  /** Error occurred */
  'error': (error: Error) => void;
}

/**
 * PaymentChannel - Efficient off-chain micropayments
 *
 * How it works:
 * 1. Sender opens channel with deposit (1 on-chain tx)
 * 2. Sender signs payments off-chain (0 gas)
 * 3. Recipient can claim at any time with latest signature
 * 4. Channel closes with settlement (1 on-chain tx)
 *
 * Result: 1000s of micropayments with only 2 blockchain transactions
 */
export class PaymentChannel extends EventEmitter<ChannelEvents> {
  private readonly config: ChannelConfig;
  private readonly chainId: number;
  private readonly usdcAddress: string;

  private _id: string;
  private _state: ChannelState = 'opening';
  private _sequence: number = 0;
  private _spent: number = 0; // in micro-USDC
  private _deposit: number;
  private _payments: ChannelPayment[] = [];
  private _createdAt: number = Date.now();
  private _expiresAt: number;
  private _openTxHash?: string;
  private _closeTxHash?: string;

  // Signer function (provided by agent wallet)
  private signer: (message: string) => Promise<string>;

  constructor(config: ChannelConfig, signer: (message: string) => Promise<string>) {
    super();

    this.config = config;
    this.chainId = CHAIN_IDS[config.network];
    this.usdcAddress = USDC_ADDRESSES[config.network];
    this.signer = signer;

    this._id = this.generateChannelId();
    this._deposit = Math.floor(parseFloat(config.depositAmount) * 1_000_000);
    this._expiresAt = Date.now() + (config.duration || 24 * 60 * 60) * 1000;
  }

  /**
   * Get channel ID
   */
  get id(): string {
    return this._id;
  }

  /**
   * Get channel info
   */
  get info(): ChannelInfo {
    return {
      id: this._id,
      state: this._state,
      sender: this.config.sender,
      recipient: this.config.recipient,
      network: this.config.network,
      deposit: (this._deposit / 1_000_000).toFixed(6),
      spent: (this._spent / 1_000_000).toFixed(6),
      remaining: ((this._deposit - this._spent) / 1_000_000).toFixed(6),
      paymentCount: this._payments.length,
      expiresAt: this._expiresAt,
      createdAt: this._createdAt,
      openTxHash: this._openTxHash,
      closeTxHash: this._closeTxHash,
    };
  }

  /**
   * Get all payments in channel
   */
  get payments(): ChannelPayment[] {
    return [...this._payments];
  }

  /**
   * Get latest payment (for claiming)
   */
  get latestPayment(): ChannelPayment | undefined {
    return this._payments[this._payments.length - 1];
  }

  /**
   * Check if channel is active
   */
  get isActive(): boolean {
    return this._state === 'open' && Date.now() < this._expiresAt;
  }

  /**
   * Check remaining capacity
   */
  get remainingCapacity(): string {
    return ((this._deposit - this._spent) / 1_000_000).toFixed(6);
  }

  /**
   * Open the channel (requires on-chain transaction)
   */
  async open(): Promise<string> {
    if (this._state !== 'opening') {
      throw new Error(`Cannot open channel in state: ${this._state}`);
    }

    // In production, this would call the smart contract
    // For now, simulate the opening
    const openingData = {
      channelId: this._id,
      sender: this.config.sender,
      recipient: this.config.recipient,
      deposit: this._deposit.toString(),
      duration: this.config.duration || 24 * 60 * 60,
      chainId: this.chainId,
      token: this.usdcAddress,
    };

    // Simulate transaction hash
    this._openTxHash = '0x' + generateNonce().slice(2, 66);
    this._state = 'open';

    this.emit('channel:opened', this.info);

    return this._openTxHash;
  }

  /**
   * Make a payment through the channel (off-chain)
   */
  async pay(amount: string, resource: string): Promise<ChannelPayment> {
    if (!this.isActive) {
      throw new Error(`Channel is not active (state: ${this._state})`);
    }

    const amountMicro = Math.floor(parseFloat(amount) * 1_000_000);

    // Check capacity
    if (this._spent + amountMicro > this._deposit) {
      throw new Error(`Insufficient channel capacity. Remaining: ${this.remainingCapacity} USDC`);
    }

    // Increment sequence
    this._sequence++;
    const newCumulativeAmount = this._spent + amountMicro;

    // Create payment message
    const paymentMessage = {
      channelId: this._id,
      sequence: this._sequence,
      amount: amountMicro.toString(),
      cumulativeAmount: newCumulativeAmount.toString(),
      resource,
      recipient: this.config.recipient,
      timestamp: Date.now(),
    };

    // Sign the payment
    const signature = await this.signer(JSON.stringify(paymentMessage));

    // Create payment record
    const payment: ChannelPayment = {
      id: `${this._id}_${this._sequence}`,
      sequence: this._sequence,
      amount: (amountMicro / 1_000_000).toFixed(6),
      cumulativeAmount: (newCumulativeAmount / 1_000_000).toFixed(6),
      resource,
      timestamp: paymentMessage.timestamp,
      signature,
    };

    // Update state
    this._spent = newCumulativeAmount;
    this._payments.push(payment);

    this.emit('payment:made', payment);

    return payment;
  }

  /**
   * Close the channel cooperatively
   */
  async close(): Promise<string> {
    if (this._state !== 'open') {
      throw new Error(`Cannot close channel in state: ${this._state}`);
    }

    this._state = 'closing';
    this.emit('channel:closing', this.info);

    // In production, this would submit the latest payment to the smart contract
    // The recipient claims the cumulative amount, sender gets the remainder

    // Simulate closing transaction
    this._closeTxHash = '0x' + generateNonce().slice(2, 66);
    this._state = 'closed';

    const finalAmount = (this._spent / 1_000_000).toFixed(6);
    this.emit('channel:closed', this.info, finalAmount);

    return this._closeTxHash;
  }

  /**
   * Force close (unilateral) - used when counterparty is unresponsive
   */
  async forceClose(): Promise<string> {
    if (this._state !== 'open') {
      throw new Error(`Cannot force close channel in state: ${this._state}`);
    }

    this._state = 'closing';
    this.emit('channel:closing', this.info);

    // In production, this initiates a dispute period
    // Either party can submit their latest state during dispute

    // Simulate
    this._closeTxHash = '0x' + generateNonce().slice(2, 66);
    this._state = 'closed';

    const finalAmount = (this._spent / 1_000_000).toFixed(6);
    this.emit('channel:closed', this.info, finalAmount);

    return this._closeTxHash;
  }

  /**
   * Dispute a closing (submit newer state)
   */
  async dispute(newerPayment: ChannelPayment): Promise<void> {
    if (this._state !== 'closing') {
      throw new Error(`Cannot dispute channel in state: ${this._state}`);
    }

    // Verify the newer payment has higher sequence
    if (newerPayment.sequence <= this._sequence) {
      throw new Error('Dispute payment must have higher sequence number');
    }

    // In production, submit to smart contract
    this._state = 'disputed';
    this.emit('channel:disputed', this.info, 'Newer state submitted');
  }

  /**
   * Verify a payment signature
   */
  async verifyPayment(payment: ChannelPayment): Promise<boolean> {
    // Reconstruct the message that was signed
    const amountMicro = Math.floor(parseFloat(payment.amount) * 1_000_000);
    const cumulativeMicro = Math.floor(parseFloat(payment.cumulativeAmount) * 1_000_000);

    const paymentMessage = {
      channelId: this._id,
      sequence: payment.sequence,
      amount: amountMicro.toString(),
      cumulativeAmount: cumulativeMicro.toString(),
      resource: payment.resource,
      recipient: this.config.recipient,
      timestamp: payment.timestamp,
    };

    // In production, verify against sender's public key
    // For now, just check format
    return (
      payment.signature.startsWith('0x') &&
      payment.signature.length >= 64 &&
      payment.sequence > 0 &&
      cumulativeMicro <= this._deposit
    );
  }

  /**
   * Get proof for on-chain settlement
   */
  getSettlementProof(): {
    channelId: string;
    latestPayment: ChannelPayment | undefined;
    totalSpent: string;
    signature: string | undefined;
  } {
    const latest = this.latestPayment;
    return {
      channelId: this._id,
      latestPayment: latest,
      totalSpent: (this._spent / 1_000_000).toFixed(6),
      signature: latest?.signature,
    };
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  private generateChannelId(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return 'channel_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

/**
 * Payment Channel Manager - Manages multiple channels
 */
export class PaymentChannelManager extends EventEmitter<ChannelEvents> {
  private channels: Map<string, PaymentChannel> = new Map();
  private recipientChannels: Map<string, Set<string>> = new Map();
  private signer: (message: string) => Promise<string>;
  private network: X402Network;
  private sender: string;

  constructor(config: {
    network: X402Network;
    sender: string;
    signer: (message: string) => Promise<string>;
  }) {
    super();
    this.network = config.network;
    this.sender = config.sender;
    this.signer = config.signer;
  }

  /**
   * Get or create a channel to a recipient
   */
  async getOrCreateChannel(recipient: string, depositAmount: string): Promise<PaymentChannel> {
    // Check for existing active channel
    const existingIds = this.recipientChannels.get(recipient);
    if (existingIds) {
      for (const id of existingIds) {
        const channel = this.channels.get(id);
        if (channel?.isActive) {
          return channel;
        }
      }
    }

    // Create new channel
    const channel = new PaymentChannel(
      {
        network: this.network,
        sender: this.sender,
        recipient,
        depositAmount,
      },
      this.signer
    );

    // Forward events
    channel.on('channel:opened', info => this.emit('channel:opened', info));
    channel.on('payment:made', payment => this.emit('payment:made', payment));
    channel.on('channel:closing', info => this.emit('channel:closing', info));
    channel.on('channel:closed', (info, amount) => this.emit('channel:closed', info, amount));
    channel.on('channel:disputed', (info, reason) => this.emit('channel:disputed', info, reason));
    channel.on('error', error => this.emit('error', error));

    // Open the channel
    await channel.open();

    // Store
    this.channels.set(channel.id, channel);
    if (!this.recipientChannels.has(recipient)) {
      this.recipientChannels.set(recipient, new Set());
    }
    this.recipientChannels.get(recipient)!.add(channel.id);

    return channel;
  }

  /**
   * Pay through channel (creates if needed)
   */
  async pay(recipient: string, amount: string, resource: string, depositAmount?: string): Promise<ChannelPayment> {
    const deposit = depositAmount || (parseFloat(amount) * 100).toFixed(6); // Default: deposit 100x the payment
    const channel = await this.getOrCreateChannel(recipient, deposit);
    return channel.pay(amount, resource);
  }

  /**
   * Get channel by ID
   */
  getChannel(channelId: string): PaymentChannel | undefined {
    return this.channels.get(channelId);
  }

  /**
   * Get all channels to a recipient
   */
  getChannelsTo(recipient: string): PaymentChannel[] {
    const ids = this.recipientChannels.get(recipient);
    if (!ids) return [];
    return Array.from(ids).map(id => this.channels.get(id)!).filter(Boolean);
  }

  /**
   * Get all active channels
   */
  getActiveChannels(): PaymentChannel[] {
    return Array.from(this.channels.values()).filter(c => c.isActive);
  }

  /**
   * Close all channels
   */
  async closeAll(): Promise<void> {
    const activeChannels = this.getActiveChannels();
    await Promise.all(activeChannels.map(c => c.close()));
  }

  /**
   * Get total capacity across all channels
   */
  getTotalCapacity(): { total: string; remaining: string; spent: string } {
    let total = 0;
    let spent = 0;

    for (const channel of this.channels.values()) {
      const info = channel.info;
      total += parseFloat(info.deposit);
      spent += parseFloat(info.spent);
    }

    return {
      total: total.toFixed(6),
      spent: spent.toFixed(6),
      remaining: (total - spent).toFixed(6),
    };
  }
}
