// ============================================================
// SYNAPSE STREAMING PAYMENT CONTROLLER
// Token-by-token micropayments with real-time quality control
// ============================================================

import { EventEmitter } from 'events';
import { StreamingPayment, StreamPaymentUpdate, DEFAULT_PLATFORM_FEES } from './types.js';
import { nanoid } from 'nanoid';

export interface StreamConfig {
  intentId: string;
  modelId: string;
  payer: string;
  payee: string;
  costPerToken: number;
  maxAmount: number;
  minDeposit?: number;
  settlementInterval?: number;
}

export class StreamingPaymentController extends EventEmitter {
  private streams: Map<string, StreamingPayment> = new Map();
  private platformFeeRate = DEFAULT_PLATFORM_FEES.streamingFee;

  // -------------------- STREAM LIFECYCLE --------------------

  async createStream(config: StreamConfig): Promise<StreamingPayment> {
    const streamId = `stream_${nanoid()}`;

    const minDeposit = config.minDeposit || config.maxAmount * 0.1; // 10% upfront by default
    const settlementInterval = config.settlementInterval || 60000; // 1 minute default

    const stream: StreamingPayment = {
      streamId,
      intentId: config.intentId,
      modelId: config.modelId,
      payer: config.payer,
      payee: config.payee,
      tokensPerSecond: 10, // Reasonable default for LLM generation
      costPerToken: config.costPerToken,
      maxAmount: config.maxAmount,
      depositedAmount: minDeposit,
      streamedTokens: 0,
      streamedAmount: 0,
      startTime: Date.now(),
      lastUpdate: Date.now(),
      status: 'active',
      canPause: true,
      settlementInterval,
      lastSettlement: Date.now(),
      settledAmount: 0,
      pendingAmount: 0,
    };

    this.streams.set(streamId, stream);

    this.emit('stream_created', { stream });

    return stream;
  }

  async getStream(streamId: string): Promise<StreamingPayment | undefined> {
    return this.streams.get(streamId);
  }

  // -------------------- STREAMING --------------------

  async streamTokens(streamId: string, tokenCount: number): Promise<StreamPaymentUpdate> {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    if (stream.status !== 'active') {
      throw new Error(`Stream is ${stream.status}, cannot stream tokens`);
    }

    // Calculate cost for these tokens
    const cost = tokenCount * stream.costPerToken;

    // Check if this would exceed max amount
    if (stream.streamedAmount + cost > stream.maxAmount) {
      // Stream up to max, then pause
      const remainingBudget = stream.maxAmount - stream.streamedAmount;
      const tokensAllowed = Math.floor(remainingBudget / stream.costPerToken);

      if (tokensAllowed <= 0) {
        await this.pauseStream(streamId, 'max_amount_reached');
        throw new Error('Maximum budget reached');
      }

      // Stream only what's allowed
      return this.streamTokens(streamId, tokensAllowed);
    }

    // Update stream
    stream.streamedTokens += tokenCount;
    stream.streamedAmount += cost;
    stream.pendingAmount += cost;
    stream.lastUpdate = Date.now();

    const update: StreamPaymentUpdate = {
      streamId,
      tokens: tokenCount,
      cost,
      totalStreamedTokens: stream.streamedTokens,
      totalStreamedCost: stream.streamedAmount,
      timestamp: Date.now(),
    };

    this.emit('tokens_streamed', { streamId, update, stream });

    // Check if we need to settle
    const timeSinceLastSettlement = Date.now() - stream.lastSettlement;
    if (timeSinceLastSettlement >= stream.settlementInterval && stream.pendingAmount > 0) {
      await this.settleStream(streamId);
    }

    return update;
  }

  // -------------------- CONTROL --------------------

  async pauseStream(streamId: string, reason?: string): Promise<void> {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    if (!stream.canPause) {
      throw new Error('Stream cannot be paused');
    }

    stream.status = 'paused';
    stream.pausedAt = Date.now();
    stream.pauseReason = reason;

    this.emit('stream_paused', { streamId, reason, stream });
  }

  async resumeStream(streamId: string): Promise<void> {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    if (stream.status !== 'paused') {
      throw new Error(`Stream is ${stream.status}, cannot resume`);
    }

    stream.status = 'active';
    stream.pausedAt = undefined;
    stream.pauseReason = undefined;

    this.emit('stream_resumed', { streamId, stream });
  }

  async cancelStream(streamId: string): Promise<void> {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    // Settle any pending amount before canceling
    if (stream.pendingAmount > 0) {
      await this.settleStream(streamId);
    }

    stream.status = 'cancelled';

    this.emit('stream_cancelled', { streamId, stream });
  }

  async completeStream(streamId: string): Promise<void> {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    // Final settlement
    if (stream.pendingAmount > 0) {
      await this.settleStream(streamId);
    }

    stream.status = 'completed';

    this.emit('stream_completed', { streamId, stream });
  }

  // -------------------- SETTLEMENT --------------------

  async settleStream(streamId: string): Promise<{
    amount: number;
    platformFee: number;
    netAmount: number;
  }> {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    if (stream.pendingAmount === 0) {
      return { amount: 0, platformFee: 0, netAmount: 0 };
    }

    const amount = stream.pendingAmount;
    const platformFee = amount * this.platformFeeRate;
    const netAmount = amount - platformFee;

    // In production, this would trigger on-chain settlement
    // For now, we just track it
    stream.settledAmount += amount;
    stream.pendingAmount = 0;
    stream.lastSettlement = Date.now();
    stream.status = 'settled';

    this.emit('stream_settled', {
      streamId,
      amount,
      platformFee,
      netAmount,
      payee: stream.payee,
      stream,
    });

    return { amount, platformFee, netAmount };
  }

  // -------------------- BATCH OPERATIONS --------------------

  async settleAllPendingStreams(): Promise<{
    settledCount: number;
    totalSettled: number;
    totalFees: number;
  }> {
    const pendingStreams = Array.from(this.streams.values()).filter(
      s => s.pendingAmount > 0 && (s.status === 'active' || s.status === 'paused')
    );

    let totalSettled = 0;
    let totalFees = 0;

    for (const stream of pendingStreams) {
      try {
        const result = await this.settleStream(stream.streamId);
        totalSettled += result.netAmount;
        totalFees += result.platformFee;
      } catch (error) {
        console.error(`Failed to settle stream ${stream.streamId}:`, error);
      }
    }

    this.emit('batch_settlement_completed', {
      settledCount: pendingStreams.length,
      totalSettled,
      totalFees,
    });

    return {
      settledCount: pendingStreams.length,
      totalSettled,
      totalFees,
    };
  }

  // -------------------- MONITORING --------------------

  getActiveStreams(): StreamingPayment[] {
    return Array.from(this.streams.values()).filter(
      s => s.status === 'active' || s.status === 'paused'
    );
  }

  getStreamsByIntent(intentId: string): StreamingPayment[] {
    return Array.from(this.streams.values()).filter(
      s => s.intentId === intentId
    );
  }

  getStreamStats(): {
    totalStreams: number;
    activeStreams: number;
    totalStreamed: number;
    totalSettled: number;
    totalPending: number;
  } {
    const streams = Array.from(this.streams.values());

    return {
      totalStreams: streams.length,
      activeStreams: streams.filter(s => s.status === 'active').length,
      totalStreamed: streams.reduce((sum, s) => sum + s.streamedAmount, 0),
      totalSettled: streams.reduce((sum, s) => sum + s.settledAmount, 0),
      totalPending: streams.reduce((sum, s) => sum + s.pendingAmount, 0),
    };
  }

  // -------------------- CLEANUP --------------------

  async cleanupCompletedStreams(olderThan: number = 24 * 60 * 60 * 1000): Promise<number> {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [streamId, stream] of this.streams.entries()) {
      if (
        (stream.status === 'completed' || stream.status === 'cancelled') &&
        now - stream.lastUpdate > olderThan
      ) {
        this.streams.delete(streamId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.emit('streams_cleaned', { count: cleanedCount });
    }

    return cleanedCount;
  }
}

// -------------------- SINGLETON --------------------

let controllerInstance: StreamingPaymentController | null = null;

export function getStreamingPaymentController(): StreamingPaymentController {
  if (!controllerInstance) {
    controllerInstance = new StreamingPaymentController();

    // Auto-settle every minute
    setInterval(async () => {
      try {
        await controllerInstance!.settleAllPendingStreams();
      } catch (error) {
        console.error('Failed to auto-settle streams:', error);
      }
    }, 60000);

    // Cleanup old streams daily
    setInterval(async () => {
      try {
        await controllerInstance!.cleanupCompletedStreams();
      } catch (error) {
        console.error('Failed to cleanup streams:', error);
      }
    }, 24 * 60 * 60 * 1000);
  }
  return controllerInstance;
}

export function resetStreamingPaymentController(): void {
  controllerInstance = null;
}
