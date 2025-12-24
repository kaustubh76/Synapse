// ============================================================
// SYNAPSE Engine Event Broadcasting
// Connects IntentEngine events to WebSocket broadcasts
// ============================================================

import { Server as SocketIOServer } from 'socket.io';
import {
  IntentEngine,
  ProviderRegistry,
  WSEventType,
  Intent,
  Bid
} from '@synapse/core';

export function setupEngineEvents(
  intentEngine: IntentEngine,
  providerRegistry: ProviderRegistry,
  io: SocketIOServer
): void {
  // -------------------- INTENT EVENTS --------------------

  // Intent created - broadcast to providers and dashboard
  intentEngine.on('intent:created', (intent: Intent) => {
    console.log(`[Event] Intent created: ${intent.id}`);

    // Broadcast to all providers
    io.to('providers').emit(WSEventType.NEW_INTENT_AVAILABLE, {
      type: WSEventType.NEW_INTENT_AVAILABLE,
      payload: { intent },
      timestamp: Date.now()
    });

    // Broadcast to dashboard clients
    io.to('dashboard').emit('intent_created', {
      type: 'intent_created',
      payload: { intent },
      timestamp: Date.now()
    });

    // Also broadcast to the specific capability room
    const baseCapability = intent.type.split('.')[0];
    io.to(`capability:${intent.type}`).emit(WSEventType.NEW_INTENT_AVAILABLE, {
      type: WSEventType.NEW_INTENT_AVAILABLE,
      payload: { intent },
      timestamp: Date.now()
    });
    io.to(`capability:${baseCapability}`).emit(WSEventType.NEW_INTENT_AVAILABLE, {
      type: WSEventType.NEW_INTENT_AVAILABLE,
      payload: { intent },
      timestamp: Date.now()
    });
  });

  // Intent updated
  intentEngine.on('intent:updated', (intent: Intent) => {
    console.log(`[Event] Intent updated: ${intent.id} -> ${intent.status}`);

    io.to(`intent:${intent.id}`).emit(WSEventType.INTENT_CREATED, {
      type: WSEventType.INTENT_CREATED,
      payload: {
        intent,
        bids: intentEngine.getBidsForIntent(intent.id)
      },
      timestamp: Date.now()
    });
  });

  // Intent completed
  intentEngine.on('intent:completed', (intent: Intent) => {
    console.log(`[Event] Intent completed: ${intent.id}`);

    const bids = intentEngine.getBidsForIntent(intent.id);

    io.to(`intent:${intent.id}`).emit(WSEventType.INTENT_COMPLETED, {
      type: WSEventType.INTENT_COMPLETED,
      payload: {
        intent,
        bids,
        result: intent.result
      },
      timestamp: Date.now()
    });

    // Broadcast to dashboard clients
    io.to('dashboard').emit('intent_completed', {
      type: 'intent_completed',
      payload: {
        intent,
        result: intent.result
      },
      timestamp: Date.now()
    });

    // Update provider reputation
    if (intent.result && intent.assignedProvider) {
      const provider = providerRegistry.getProviderByAddress(intent.assignedProvider);
      if (provider) {
        providerRegistry.recordJobSuccess(
          provider.id,
          intent.result.executionTime,
          intent.result.settledAmount
        );
      }
    }
  });

  // Intent failed
  intentEngine.on('intent:failed', (intent: Intent, reason: string) => {
    console.log(`[Event] Intent failed: ${intent.id} - ${reason}`);

    io.to(`intent:${intent.id}`).emit(WSEventType.INTENT_FAILED, {
      type: WSEventType.INTENT_FAILED,
      payload: {
        intent,
        reason,
        bids: intentEngine.getBidsForIntent(intent.id)
      },
      timestamp: Date.now()
    });

    // Broadcast to dashboard clients
    io.to('dashboard').emit('intent_failed', {
      type: 'intent_failed',
      payload: {
        intent,
        reason
      },
      timestamp: Date.now()
    });
  });

  // -------------------- BID EVENTS --------------------

  // Bid received
  intentEngine.on('bid:received', (bid: Bid, intent: Intent) => {
    console.log(`[Event] Bid received: ${bid.id} for intent ${intent.id} - $${bid.bidAmount}`);

    const allBids = intentEngine.getBidsForIntent(intent.id);
    const leader = allBids.reduce((best, b) =>
      b.calculatedScore > best.calculatedScore ? b : best, allBids[0]);

    io.to(`intent:${intent.id}`).emit(WSEventType.BID_RECEIVED, {
      type: WSEventType.BID_RECEIVED,
      payload: {
        bid,
        intent,
        totalBids: allBids.length,
        currentLeader: leader.providerAddress,
        allBids
      },
      timestamp: Date.now()
    });

    // Broadcast to dashboard clients
    io.to('dashboard').emit('bid_received', {
      type: 'bid_received',
      payload: {
        bid,
        intent,
        totalBids: allBids.length,
        currentLeader: leader.providerAddress
      },
      timestamp: Date.now()
    });
  });

  // Bid updated
  intentEngine.on('bid:updated', (bid: Bid) => {
    console.log(`[Event] Bid updated: ${bid.id} -> ${bid.status}`);

    io.to(`intent:${bid.intentId}`).emit(WSEventType.BID_UPDATED, {
      type: WSEventType.BID_UPDATED,
      payload: { bid },
      timestamp: Date.now()
    });
  });

  // -------------------- WINNER EVENTS --------------------

  // Winner selected
  intentEngine.on('winner:selected', (bid: Bid, intent: Intent) => {
    console.log(`[Event] Winner selected: ${bid.providerAddress} for intent ${intent.id}`);

    const allBids = intentEngine.getBidsForIntent(intent.id);

    // Broadcast to all subscribers
    io.to(`intent:${intent.id}`).emit(WSEventType.WINNER_SELECTED, {
      type: WSEventType.WINNER_SELECTED,
      payload: {
        winner: bid,
        intent,
        allBids,
        failoverQueue: intent.failoverQueue
      },
      timestamp: Date.now()
    });

    // Notify the winning provider - also broadcast to all providers
    // so they can check if they won
    io.to('providers').emit(WSEventType.WINNER_SELECTED, {
      type: WSEventType.WINNER_SELECTED,
      payload: {
        winner: bid,
        intent,
        allBids,
        failoverQueue: intent.failoverQueue
      },
      timestamp: Date.now()
    });

    // Broadcast to dashboard clients
    io.to('dashboard').emit('winner_selected', {
      type: 'winner_selected',
      payload: {
        winner: bid,
        intent
      },
      timestamp: Date.now()
    });
  });

  // -------------------- FAILOVER EVENTS --------------------

  // Failover triggered
  intentEngine.on('failover:triggered', (intent: Intent, failedProvider: string, newProvider: string) => {
    console.log(`[Event] Failover: ${failedProvider} -> ${newProvider} for intent ${intent.id}`);

    const allBids = intentEngine.getBidsForIntent(intent.id);

    io.to(`intent:${intent.id}`).emit(WSEventType.FAILOVER_TRIGGERED, {
      type: WSEventType.FAILOVER_TRIGGERED,
      payload: {
        intent,
        failedProvider,
        newProvider,
        remainingFailovers: intent.failoverQueue.length,
        allBids
      },
      timestamp: Date.now()
    });

    // Broadcast to dashboard clients
    io.to('dashboard').emit('failover_triggered', {
      type: 'failover_triggered',
      payload: {
        intent,
        failedProvider,
        newProvider
      },
      timestamp: Date.now()
    });

    // Penalize failed provider
    const failedProviderRecord = providerRegistry.getProviderByAddress(failedProvider);
    if (failedProviderRecord) {
      providerRegistry.recordJobFailure(failedProviderRecord.id);
    }
  });

  // -------------------- PAYMENT EVENTS --------------------

  // Payment settled
  intentEngine.on('payment:settled', (intent: Intent, amount: number, txHash: string) => {
    console.log(`[Event] Payment settled: $${amount} for intent ${intent.id} - tx: ${txHash}`);

    io.to(`intent:${intent.id}`).emit(WSEventType.PAYMENT_SETTLED, {
      type: WSEventType.PAYMENT_SETTLED,
      payload: {
        intent,
        amount,
        transactionHash: txHash,
        refundAmount: intent.maxBudget - amount
      },
      timestamp: Date.now()
    });

    // Broadcast to dashboard clients
    io.to('dashboard').emit('payment_settled', {
      type: 'payment_settled',
      payload: {
        intentId: intent.id,
        provider: intent.assignedProvider,
        amount,
        transactionHash: txHash
      },
      timestamp: Date.now()
    });
  });

  // -------------------- PROVIDER EVENTS --------------------

  // Provider online
  providerRegistry.on('provider:online', (provider) => {
    console.log(`[Event] Provider online: ${provider.name}`);

    // Broadcast to dashboard clients
    io.to('dashboard').emit('provider_connected', {
      type: 'provider_connected',
      payload: {
        provider: {
          id: provider.id,
          name: provider.name,
          address: provider.address,
          capabilities: provider.capabilities
        }
      },
      timestamp: Date.now()
    });
  });

  // Provider offline
  providerRegistry.on('provider:offline', (provider) => {
    console.log(`[Event] Provider offline: ${provider.name}`);

    // Broadcast to dashboard clients
    io.to('dashboard').emit('provider_disconnected', {
      type: 'provider_disconnected',
      payload: {
        provider: {
          id: provider.id,
          name: provider.name,
          address: provider.address
        }
      },
      timestamp: Date.now()
    });
  });

  // Provider updated (reputation change, etc.)
  providerRegistry.on('provider:updated', (provider) => {
    console.log(`[Event] Provider updated: ${provider.name} - Rep: ${provider.reputationScore}`);

    // Broadcast to dashboard clients
    io.to('dashboard').emit('provider_updated', {
      type: 'provider_updated',
      payload: {
        provider: {
          id: provider.id,
          name: provider.name,
          reputationScore: provider.reputationScore,
          totalJobs: provider.totalJobs,
          successfulJobs: provider.successfulJobs
        }
      },
      timestamp: Date.now()
    });
  });

  console.log('Engine events connected to WebSocket broadcasting');
}
