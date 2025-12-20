#!/usr/bin/env npx ts-node
// ============================================================
// SYNAPSE Crypto Bot
// A provider bot that handles cryptocurrency price requests
// ============================================================

/* eslint-disable @typescript-eslint/no-var-requires */
const { createProvider } = require('@synapse/sdk');

const API_URL = process.env.SYNAPSE_API_URL || 'http://localhost:3001';

// Mock crypto prices (realistic values)
const CRYPTO_PRICES: Record<string, { price: number; change24h: number }> = {
  BTC: { price: 98500, change24h: 2.3 },
  ETH: { price: 3450, change24h: 1.8 },
  SOL: { price: 195, change24h: 4.2 },
  USDC: { price: 1.00, change24h: 0 },
  USDT: { price: 1.00, change24h: 0 },
  BNB: { price: 625, change24h: -0.5 },
  XRP: { price: 2.15, change24h: 3.1 },
  ADA: { price: 0.92, change24h: 1.2 },
  DOGE: { price: 0.38, change24h: 5.5 },
  AVAX: { price: 42, change24h: 2.1 },
  DOT: { price: 7.80, change24h: 0.8 },
  MATIC: { price: 0.52, change24h: -1.2 },
  LINK: { price: 24.50, change24h: 2.9 },
  UNI: { price: 14.20, change24h: 1.5 },
  ATOM: { price: 9.80, change24h: 0.3 }
};

function getCryptoPrice(symbol: string): {
  symbol: string;
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  timestamp: string;
} {
  const upperSymbol = symbol.toUpperCase();
  const crypto = CRYPTO_PRICES[upperSymbol] || {
    price: Math.random() * 100,
    change24h: (Math.random() - 0.5) * 10
  };

  // Add small price variation
  const priceVariation = crypto.price * (Math.random() - 0.5) * 0.002;
  const currentPrice = crypto.price + priceVariation;

  return {
    symbol: upperSymbol,
    price: Math.round(currentPrice * 100) / 100,
    change24h: Math.round(crypto.change24h * 100) / 100,
    marketCap: Math.round(currentPrice * (Math.random() * 1000000000 + 100000000)),
    volume24h: Math.round(currentPrice * (Math.random() * 100000000 + 10000000)),
    timestamp: new Date().toISOString()
  };
}

function getCryptoHistory(symbol: string, days: number = 7): Array<{
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}> {
  const basePrice = CRYPTO_PRICES[symbol.toUpperCase()]?.price || 100;
  const history = [];

  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    const dailyVariation = (Math.random() - 0.5) * 0.1;
    const open = basePrice * (1 + dailyVariation);
    const close = open * (1 + (Math.random() - 0.5) * 0.05);
    const high = Math.max(open, close) * (1 + Math.random() * 0.02);
    const low = Math.min(open, close) * (1 - Math.random() * 0.02);

    history.push({
      date: date.toISOString().split('T')[0],
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.round(Math.random() * 1000000000)
    });
  }

  return history;
}

async function main() {
  console.log('📈 Starting Synapse Crypto Bot...');
  console.log(`📡 Connecting to: ${API_URL}`);

  const provider = createProvider({
    apiUrl: API_URL,
    name: 'CryptoOracle',
    description: 'Real-time cryptocurrency prices from multiple exchanges with high accuracy',
    capabilities: ['crypto.price', 'crypto.history'],
    endpoint: 'http://localhost:3020/api'
  });

  // Set bid strategy - slightly more aggressive pricing
  provider.setBidStrategy({
    baseBid: 0.004,
    budgetPercentage: 0.25,
    minBid: 0.002,
    maxBid: 0.012,
    confidence: 98,
    estimatedTime: 200
  });

  // Set high reputation (this bot has been running longer)
  provider.setReputationScore(4.8);

  // Handle price requests
  provider.onIntent('crypto.price', async (intent, params) => {
    const symbol = (params.symbol as string) || 'BTC';
    console.log(`💰 Getting price for: ${symbol}`);

    // Fast response time
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

    const data = getCryptoPrice(symbol);

    return {
      success: true,
      data,
      executionTime: 100
    };
  });

  // Handle history requests
  provider.onIntent('crypto.history', async (intent, params) => {
    const symbol = (params.symbol as string) || 'BTC';
    const days = (params.days as number) || 7;
    console.log(`📊 Getting ${days}-day history for: ${symbol}`);

    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 150));

    const current = getCryptoPrice(symbol);
    const history = getCryptoHistory(symbol, days);

    return {
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        current,
        history
      },
      executionTime: 200
    };
  });

  // Event listeners
  provider.on('connected', () => {
    console.log('✅ Connected to Synapse network');
  });

  provider.on('registered', (id) => {
    console.log(`✅ Registered as provider: ${id}`);
    console.log(`💳 Wallet: ${provider.getWalletAddress()}`);
  });

  provider.on('intentReceived', (intent) => {
    console.log(`📬 Intent: ${intent.type} (Budget: $${intent.maxBudget})`);
  });

  provider.on('bidSubmitted', (bid) => {
    console.log(`💰 Bid: $${bid.bidAmount.toFixed(4)} (Score: ${bid.calculatedScore?.toFixed(3)})`);
  });

  provider.on('intentAssigned', (intent) => {
    console.log(`🎯 WON: ${intent.id}`);
  });

  provider.on('executionCompleted', (intent, result) => {
    console.log(`✅ Done: ${intent.type} - ${JSON.stringify(result).substring(0, 80)}...`);
  });

  provider.on('paymentReceived', (amount, txHash) => {
    console.log(`💵 Paid: $${amount.toFixed(4)}`);
  });

  provider.on('error', (error) => {
    console.error('❌ Error:', error);
  });

  // Start
  try {
    await provider.start();
    console.log('');
    console.log('📈 Crypto Bot is running!');
    console.log('   Waiting for crypto intents...');
    console.log('');
    console.log('   Press Ctrl+C to stop');
    console.log('');

    // Stats display
    setInterval(() => {
      const stats = provider.getStats();
      if (stats.intentsReceived > 0) {
        console.log(`📊 Stats: ${stats.bidsWon}/${stats.intentsReceived} won, $${stats.totalEarnings.toFixed(4)} earned`);
      }
    }, 30000);

  } catch (error) {
    console.error('Failed to start Crypto Bot:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Crypto Bot...');
  process.exit(0);
});

main();
