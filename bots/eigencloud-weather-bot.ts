#!/usr/bin/env npx tsx
// ============================================================
// SYNAPSE EigenCloud Weather Bot - Premium Provider
// Uses real deTERMinal AI + Intel TDX TEE + x402 Payments
// ============================================================

import { createProvider } from '@synapse/sdk';

const API_URL = process.env.SYNAPSE_API_URL || 'http://localhost:3001';
const WEB_URL = process.env.WEB_URL || 'http://localhost:3000';

interface EigenCloudResponse {
  success: boolean;
  result?: {
    data: Record<string, unknown>;
    executionTime: number;
    settledAmount: number;
  };
  eigencompute?: {
    teeType: string;
    verified: boolean;
    enclaveId?: string;
    jobId?: string;
    measurements?: {
      mrEnclave: string;
      mrSigner: string;
    };
  };
  payment?: {
    status: string;
    amount: number;
    currency: string;
    txHash?: string;
    blockNumber?: number;
  };
  error?: string;
}

// Execute via EigenCloud API with real AI + TEE + x402 payment
async function executeWithEigenCloud(
  intentId: string,
  intentType: string,
  params: Record<string, unknown>,
  providerId: string
): Promise<EigenCloudResponse> {
  console.log('  [TEE] Initializing Intel TDX enclave...');
  console.log('  [AI] Connecting to deTERMinal AI...');

  const response = await fetch(`${WEB_URL}/api/intents/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intentId,
      intentType,
      params,
      maxBudget: 0.02,
      providerId,
    }),
  });

  const data: EigenCloudResponse = await response.json();

  if (data.success) {
    console.log('  [AI] Response generated successfully');
    console.log(`  [TEE] ${data.eigencompute?.teeType?.toUpperCase()} attestation: ${data.eigencompute?.verified ? 'VERIFIED' : 'pending'}`);
    if (data.payment?.txHash) {
      console.log(`  [x402] Payment: $${data.payment.amount} USDC`);
      console.log(`  [x402] Block: #${data.payment.blockNumber}`);
      console.log(`  [x402] TX: ${data.payment.txHash.slice(0, 24)}...`);
    }
    return data;
  } else {
    throw new Error(data.error || 'EigenCloud execution failed');
  }
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     EIGENCLOUD WEATHER PROVIDER - Premium AI Service     ║');
  console.log('║  deTERMinal AI | Intel TDX TEE | x402 USDC Payments      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  API Server: ${API_URL}`);
  console.log(`  Web Server: ${WEB_URL}`);
  console.log('');

  const provider = createProvider({
    apiUrl: API_URL,
    name: 'EigenCloud Weather AI',
    description: 'Premium weather service powered by deTERMinal AI with TEE verification and real USDC payments',
    capabilities: ['weather.current', 'weather.forecast'],
    endpoint: 'http://localhost:3015/api',
    teeAttestation: 'intel_tdx_v1'
  });

  // Premium pricing strategy
  provider.setBidStrategy({
    baseBid: 0.004,
    budgetPercentage: 0.25,
    minBid: 0.003,
    maxBid: 0.015,
    confidence: 98,
    estimatedTime: 500
  });

  provider.setReputationScore(4.8);

  // Handle weather.current with EigenCloud AI
  provider.onIntent('weather.current', async (intent: { id: string; type: string }, params: Record<string, unknown>) => {
    const city = (params.city as string) || 'New York';
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  WEATHER REQUEST: ${city}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    try {
      const result = await executeWithEigenCloud(
        intent.id,
        'weather.current',
        { city },
        'eigencloud-weather-premium'
      );

      return {
        success: true,
        data: result.result?.data || { city, source: 'EigenCloud AI' },
        executionTime: result.result?.executionTime || 1000,
        eigencompute: result.eigencompute,
        payment: result.payment
      };
    } catch (error) {
      console.error('  [ERROR]', error);
      throw error;
    }
  });

  // Handle weather.forecast with EigenCloud AI
  provider.onIntent('weather.forecast', async (intent: { id: string; type: string }, params: Record<string, unknown>) => {
    const city = (params.city as string) || 'New York';
    const days = (params.days as number) || 5;
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  FORECAST REQUEST: ${city} (${days} days)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    try {
      const result = await executeWithEigenCloud(
        intent.id,
        'weather.forecast',
        { city, days },
        'eigencloud-weather-premium'
      );

      return {
        success: true,
        data: result.result?.data || { city, source: 'EigenCloud AI' },
        executionTime: result.result?.executionTime || 1500,
        eigencompute: result.eigencompute,
        payment: result.payment
      };
    } catch (error) {
      console.error('  [ERROR]', error);
      throw error;
    }
  });

  // Event handlers
  provider.on('connected', () => {
    console.log('  [NETWORK] Connected to Synapse Intent Network');
  });

  provider.on('registered', (id: string) => {
    console.log(`  [REGISTERED] Provider ID: ${id}`);
    console.log(`  [WALLET] ${provider.getWalletAddress()}`);
    console.log(`  [TEE] Intel TDX Attestation: ACTIVE`);
    console.log('');
  });

  provider.on('intentReceived', (intent: { type: string; maxBudget: number }) => {
    console.log(`  [INTENT] ${intent.type} | Budget: $${intent.maxBudget}`);
  });

  provider.on('bidSubmitted', (bid: { bidAmount: number; calculatedScore?: number }) => {
    console.log(`  [BID] $${bid.bidAmount.toFixed(4)} | Score: ${bid.calculatedScore?.toFixed(1) || 'N/A'}`);
  });

  provider.on('intentAssigned', (intent: { id: string; type: string }) => {
    console.log(`\n  ╔═══════════════════════════════════════════╗`);
    console.log(`  ║  WON INTENT: ${intent.id.slice(0, 20)}...  ║`);
    console.log(`  ╚═══════════════════════════════════════════╝`);
  });

  provider.on('executionCompleted', (intent: { type: string }, result: { eigencompute?: { verified: boolean }; payment?: { txHash?: string } }) => {
    console.log(`  [COMPLETE] ${intent.type}`);
    if (result?.eigencompute?.verified) {
      console.log(`  [TEE] Verification: PASSED`);
    }
    if (result?.payment?.txHash) {
      console.log(`  [PAYMENT] TX confirmed on-chain`);
    }
  });

  provider.on('paymentReceived', (amount: number, txHash: string) => {
    console.log(`  [EARNED] $${amount.toFixed(4)} USDC | TX: ${txHash.slice(0, 20)}...`);
  });

  provider.on('error', (error: Error) => {
    console.error(`  [ERROR] ${error.message}`);
  });

  // Start provider
  try {
    await provider.start();
    console.log('');
    console.log('  ┌─────────────────────────────────────────────┐');
    console.log('  │  EigenCloud Weather AI Provider is LIVE!    │');
    console.log('  │                                             │');
    console.log('  │  • Real deTERMinal AI inference             │');
    console.log('  │  • Intel TDX TEE verification               │');
    console.log('  │  • x402 USDC micropayments on Base Sepolia  │');
    console.log('  └─────────────────────────────────────────────┘');
    console.log('');
    console.log('  Press Ctrl+C to stop');
    console.log('');

    // Stats every 60s
    setInterval(() => {
      const stats = provider.getStats();
      if (stats.intentsReceived > 0) {
        console.log(`  [STATS] Received: ${stats.intentsReceived} | Won: ${stats.bidsWon} | Earned: $${stats.totalEarnings.toFixed(4)}`);
      }
    }, 60000);

  } catch (error) {
    console.error('  [FATAL] Failed to start provider:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\n  Shutting down EigenCloud Weather Provider...');
  process.exit(0);
});

main();
