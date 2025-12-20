// ============================================================
// SYNAPSE Crypto Bot Provider
// Provides cryptocurrency price data and bids on crypto intents
// x402 enabled for direct API access
// ============================================================

import express from 'express';
import { io as SocketIOClient, Socket } from 'socket.io-client';
import dotenv from 'dotenv';
import { nanoid } from 'nanoid';
import {
  Intent,
  WSEventType,
  WSMessage,
  Bid,
  IntentStatus,
  x402Middleware,
  X402Config
} from '@synapse/core';

dotenv.config();

// Configuration
const PORT = process.env.PORT || 3020;
const SYNAPSE_API_URL = process.env.SYNAPSE_API_URL || 'http://localhost:3001';
const PROVIDER_ADDRESS = process.env.PROVIDER_ADDRESS || `0xCryptoBot_${nanoid(8)}`;
const PROVIDER_NAME = 'CryptoOracle';

// Provider state
let providerId: string | null = null;
let socket: Socket | null = null;

// Simulated crypto prices (realistic as of late 2025)
const cryptoPrices: Record<string, { price: number; change24h: number; marketCap: string }> = {
  'btc': { price: 98500, change24h: 2.3, marketCap: '1.95T' },
  'bitcoin': { price: 98500, change24h: 2.3, marketCap: '1.95T' },
  'eth': { price: 3850, change24h: -0.8, marketCap: '462B' },
  'ethereum': { price: 3850, change24h: -0.8, marketCap: '462B' },
  'sol': { price: 245, change24h: 5.2, marketCap: '115B' },
  'solana': { price: 245, change24h: 5.2, marketCap: '115B' },
  'bnb': { price: 720, change24h: 1.1, marketCap: '107B' },
  'xrp': { price: 2.45, change24h: -1.2, marketCap: '132B' },
  'ada': { price: 1.15, change24h: 3.5, marketCap: '40B' },
  'cardano': { price: 1.15, change24h: 3.5, marketCap: '40B' },
  'doge': { price: 0.42, change24h: 8.2, marketCap: '62B' },
  'dogecoin': { price: 0.42, change24h: 8.2, marketCap: '62B' },
  'dot': { price: 9.80, change24h: -0.5, marketCap: '14B' },
  'polkadot': { price: 9.80, change24h: -0.5, marketCap: '14B' },
  'avax': { price: 48, change24h: 4.1, marketCap: '19B' },
  'avalanche': { price: 48, change24h: 4.1, marketCap: '19B' },
  'matic': { price: 1.25, change24h: 0.3, marketCap: '11B' },
  'polygon': { price: 1.25, change24h: 0.3, marketCap: '11B' },
  'link': { price: 22, change24h: 1.8, marketCap: '13B' },
  'chainlink': { price: 22, change24h: 1.8, marketCap: '13B' },
  'usdc': { price: 1.00, change24h: 0.0, marketCap: '45B' },
  'usdt': { price: 1.00, change24h: 0.0, marketCap: '91B' }
};

// Get crypto price with small random variation for realism
function getCryptoPrice(symbol: string): {
  symbol: string;
  price: number;
  change24h: number;
  marketCap: string;
  timestamp: number;
} {
  const normalized = symbol.toLowerCase().trim();
  const data = cryptoPrices[normalized];

  if (data) {
    // Add small price variation (±0.5%)
    const variation = 1 + (Math.random() - 0.5) * 0.01;
    return {
      symbol: normalized.toUpperCase(),
      price: Math.round(data.price * variation * 100) / 100,
      change24h: data.change24h,
      marketCap: data.marketCap,
      timestamp: Date.now()
    };
  }

  // Unknown token - return random low price
  return {
    symbol: normalized.toUpperCase(),
    price: Math.round(Math.random() * 10 * 100) / 100,
    change24h: (Math.random() - 0.5) * 20,
    marketCap: 'Unknown',
    timestamp: Date.now()
  };
}

// Calculate bid amount
function calculateBidAmount(intent: Intent): number {
  const baseBid = 0.003; // $0.003 base - we're competitive!
  const maxBudget = intent.maxBudget;

  // Be aggressive on pricing
  const competitiveBid = Math.min(baseBid, maxBudget * 0.3);

  // Small random variation
  const variation = (Math.random() - 0.5) * 0.001;

  return Math.max(0.001, competitiveBid + variation);
}

// Submit bid for an intent
async function submitBid(intent: Intent): Promise<void> {
  if (!providerId) return;

  // Check if we can handle this intent
  if (!intent.type.startsWith('crypto')) return;

  const bidAmount = calculateBidAmount(intent);
  const estimatedTime = 200 + Math.floor(Math.random() * 300); // Fast! 200-500ms

  console.log(`📤 Submitting bid for intent ${intent.id}: $${bidAmount.toFixed(4)}`);

  try {
    const response = await fetch(`${SYNAPSE_API_URL}/api/intents/${intent.id}/bid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bidAmount,
        estimatedTime,
        confidence: 98,
        providerAddress: PROVIDER_ADDRESS,
        providerId,
        reputationScore: 4.9, // High reputation
        teeAttested: false,
        capabilities: ['crypto.price', 'crypto.history']
      })
    });

    const result = await response.json();
    if (result.success) {
      console.log(`✅ Bid accepted: ${result.data.id} (Score: ${result.data.calculatedScore})`);
    } else {
      console.log(`❌ Bid rejected: ${result.error?.message}`);
    }
  } catch (error) {
    console.error('Error submitting bid:', error);
  }
}

// Execute an intent
async function executeIntent(intent: Intent): Promise<void> {
  console.log(`🚀 Executing intent ${intent.id}...`);

  const startTime = Date.now();

  try {
    // Extract symbol from params
    const symbol = (intent.params.symbol as string) ||
                   (intent.params.coin as string) ||
                   (intent.params.token as string) || 'BTC';

    // Simulate fast processing
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    // Get price data
    const priceData = getCryptoPrice(symbol);
    const executionTime = Date.now() - startTime;

    console.log(`📊 ${priceData.symbol}: $${priceData.price} (${priceData.change24h > 0 ? '+' : ''}${priceData.change24h}%)`);

    // Submit result
    const response = await fetch(`${SYNAPSE_API_URL}/api/intents/${intent.id}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: priceData,
        providerId: PROVIDER_ADDRESS,
        executionTime,
        proof: `crypto_proof_${nanoid(16)}`
      })
    });

    const result = await response.json();
    if (result.success) {
      console.log(`✅ Result submitted for intent ${intent.id}`);
      await simulatePayment(intent.id);
    } else {
      console.log(`❌ Result rejected: ${result.error?.message}`);
    }
  } catch (error) {
    console.error('Error executing intent:', error);
  }
}

// Simulate payment
async function simulatePayment(intentId: string): Promise<void> {
  try {
    const response = await fetch(`${SYNAPSE_API_URL}/api/payments/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intentId,
        providerAddress: PROVIDER_ADDRESS
      })
    });

    const result = await response.json();
    if (result.success) {
      console.log(`💰 Payment received: $${result.data.settledAmount} (tx: ${result.data.transactionHash})`);
    }
  } catch (error) {
    console.error('Error simulating payment:', error);
  }
}

// Connect to Synapse
async function connectToSynapse(): Promise<void> {
  console.log(`Connecting to Synapse at ${SYNAPSE_API_URL}...`);

  try {
    const response = await fetch(`${SYNAPSE_API_URL}/api/providers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: PROVIDER_NAME,
        description: 'Real-time cryptocurrency prices from multiple exchanges',
        capabilities: ['crypto.price', 'crypto.history'],
        endpoint: `http://localhost:${PORT}/api`,
        address: PROVIDER_ADDRESS
      })
    });

    const result = await response.json();
    if (result.success) {
      providerId = result.data.id;
      console.log(`✅ Provider registered: ${providerId}`);
    }
  } catch (error) {
    console.error('Error registering provider:', error);
  }

  // Connect WebSocket
  socket = SocketIOClient(SYNAPSE_API_URL);

  socket.on('connect', () => {
    console.log('✅ WebSocket connected');
    socket!.emit(WSEventType.SUBSCRIBE_PROVIDER, {
      providerId,
      address: PROVIDER_ADDRESS,
      capabilities: ['crypto.price', 'crypto.history']
    });

    // Send heartbeat every 15 seconds to stay online
    setInterval(() => {
      if (socket?.connected) {
        socket.emit('heartbeat');
      }
    }, 15000);
  });

  socket.on(WSEventType.NEW_INTENT_AVAILABLE, (message: WSMessage<{ intent?: Intent; intents?: Intent[] }>) => {
    if (message.payload?.intent) handleNewIntent(message.payload.intent);
    if (message.payload?.intents) message.payload.intents.forEach(handleNewIntent);
  });

  socket.on(WSEventType.WINNER_SELECTED, (message: WSMessage<{ winner: Bid; intent: Intent }>) => {
    if (message.payload?.winner?.providerAddress === PROVIDER_ADDRESS) {
      console.log(`🎉 We won intent ${message.payload.intent.id}!`);
      executeIntent(message.payload.intent);
    }
  });

  socket.on('disconnect', () => console.log('❌ WebSocket disconnected'));
}

function handleNewIntent(intent: Intent): void {
  if (intent.status !== IntentStatus.OPEN) return;
  if (!intent.type.startsWith('crypto')) return;

  console.log(`📋 Intent ${intent.id}: ${intent.type} (Budget: $${intent.maxBudget})`);
  submitBid(intent);
}

// Express app
const app = express();
app.use(express.json());

// x402 configuration for direct API access
const x402Config: X402Config = {
  price: 0.003,  // $0.003 per request - competitive!
  network: process.env.X402_NETWORK || 'base-sepolia',
  token: 'USDC',
  recipient: PROVIDER_ADDRESS,
  description: 'CryptoOracle - Real-time crypto prices'
};

// Health check (free)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', provider: PROVIDER_NAME, providerId });
});

// Direct price API (x402 protected)
app.get('/api/price',
  x402Middleware(x402Config),
  (req, res) => {
    const symbol = (req.query.symbol as string) || 'BTC';
    const priceData = getCryptoPrice(symbol);
    const paymentInfo = (req as any).x402Payment;

    res.json({
      ...priceData,
      x402: paymentInfo ? {
        paid: true,
        txHash: paymentInfo.txHash,
        amount: paymentInfo.amount
      } : { paid: false }
    });
  }
);

// Batch prices (x402 protected with higher price)
app.get('/api/prices',
  x402Middleware({ ...x402Config, price: 0.01, description: 'CryptoOracle - Batch prices' }),
  (req, res) => {
    const symbols = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE'];
    res.json(symbols.map(s => getCryptoPrice(s)));
  }
);

// Free preview endpoint
app.get('/api/price/preview', (req, res) => {
  const symbol = (req.query.symbol as string) || 'BTC';
  const data = getCryptoPrice(symbol);
  res.json({
    symbol: data.symbol,
    change24h: data.change24h > 0 ? 'up' : 'down',
    note: 'Upgrade to x402 for exact price data'
  });
});

// Start server
app.listen(PORT, async () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   💰 CRYPTO BOT PROVIDER                                      ║
║                                                               ║
║   Name: ${PROVIDER_NAME.padEnd(50)}║
║   Address: ${PROVIDER_ADDRESS.padEnd(47)}║
║   Capabilities: crypto.price, crypto.history                  ║
║                                                               ║
║   Local API: http://localhost:${PORT}/api/price                 ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  await connectToSynapse();
});
