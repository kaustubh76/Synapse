// ============================================================
// SYNAPSE News Bot Provider
// Provides news aggregation and bids on news intents
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
  IntentStatus
} from '@synapse/types';

dotenv.config();

// Configuration
const PORT = process.env.PORT || 3030;
const SYNAPSE_API_URL = process.env.SYNAPSE_API_URL || 'http://localhost:3001';
const PROVIDER_ADDRESS = process.env.PROVIDER_ADDRESS || `0xNewsBot_${nanoid(8)}`;
const PROVIDER_NAME = 'NewsAggregator Pro';

// Provider state
let providerId: string | null = null;
let socket: Socket | null = null;

// Simulated news headlines
const newsDatabase: Record<string, Array<{
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary: string;
}>> = {
  'crypto': [
    {
      title: 'Bitcoin Approaches $100K as Institutional Adoption Accelerates',
      source: 'CoinDesk',
      url: 'https://coindesk.com/btc-100k',
      publishedAt: new Date().toISOString(),
      summary: 'Major financial institutions announce new Bitcoin ETF products as price nears historic milestone.'
    },
    {
      title: 'Ethereum L2 Networks See Record Transaction Volumes',
      source: 'The Block',
      url: 'https://theblock.co/eth-l2',
      publishedAt: new Date(Date.now() - 3600000).toISOString(),
      summary: 'Base, Arbitrum, and Optimism collectively process over 50M daily transactions.'
    },
    {
      title: 'x402 Protocol Gains Momentum in Web3 Payments',
      source: 'Decrypt',
      url: 'https://decrypt.co/x402',
      publishedAt: new Date(Date.now() - 7200000).toISOString(),
      summary: 'New HTTP-native payment standard sees widespread developer adoption.'
    }
  ],
  'ai': [
    {
      title: 'AI Agents Enter Production at Scale Across Fortune 500',
      source: 'TechCrunch',
      url: 'https://techcrunch.com/ai-agents',
      publishedAt: new Date().toISOString(),
      summary: 'Autonomous AI systems now handle 30% of enterprise workflows at major corporations.'
    },
    {
      title: 'Claude 4 Sets New Benchmarks in Reasoning Tasks',
      source: 'VentureBeat',
      url: 'https://venturebeat.com/claude4',
      publishedAt: new Date(Date.now() - 5400000).toISOString(),
      summary: 'Anthropic releases next-generation model with breakthrough capabilities.'
    }
  ],
  'tech': [
    {
      title: 'Apple Unveils AR Glasses at Record Low Price Point',
      source: 'The Verge',
      url: 'https://theverge.com/apple-ar',
      publishedAt: new Date().toISOString(),
      summary: 'Vision Air brings spatial computing to mainstream consumers at $999.'
    },
    {
      title: 'Quantum Computing Achieves Error Correction Milestone',
      source: 'Wired',
      url: 'https://wired.com/quantum',
      publishedAt: new Date(Date.now() - 10800000).toISOString(),
      summary: 'Google and IBM announce fault-tolerant quantum processors.'
    }
  ],
  'finance': [
    {
      title: 'Federal Reserve Signals Rate Cuts for 2026',
      source: 'Bloomberg',
      url: 'https://bloomberg.com/fed',
      publishedAt: new Date().toISOString(),
      summary: 'Markets rally as central bank hints at easing monetary policy.'
    },
    {
      title: 'Stablecoin Market Cap Exceeds $200 Billion',
      source: 'Reuters',
      url: 'https://reuters.com/stablecoins',
      publishedAt: new Date(Date.now() - 14400000).toISOString(),
      summary: 'USDC and USDT dominate as regulatory clarity improves globally.'
    }
  ],
  'default': [
    {
      title: 'Global Climate Summit Reaches Historic Agreement',
      source: 'BBC',
      url: 'https://bbc.com/climate',
      publishedAt: new Date().toISOString(),
      summary: '195 nations commit to accelerated emissions reduction targets.'
    },
    {
      title: 'SpaceX Successfully Lands Starship for Commercial Operations',
      source: 'Space.com',
      url: 'https://space.com/starship',
      publishedAt: new Date(Date.now() - 18000000).toISOString(),
      summary: 'First commercial cargo mission to orbit marks new era in space travel.'
    }
  ]
};

// Get news by topic
function getNews(topic: string, limit: number = 5): Array<{
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary: string;
}> {
  const normalized = topic.toLowerCase().trim();
  const articles = newsDatabase[normalized] || newsDatabase['default'];

  // Mix in some default news
  const mixed = [...articles];
  if (normalized !== 'default' && newsDatabase['default']) {
    mixed.push(...newsDatabase['default'].slice(0, 2));
  }

  // Sort by date and limit
  return mixed
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, limit);
}

// Calculate bid amount
function calculateBidAmount(intent: Intent): number {
  const baseBid = 0.008; // $0.008 base - news is more expensive
  const maxBudget = intent.maxBudget;

  const competitiveBid = Math.min(baseBid, maxBudget * 0.5);
  const variation = (Math.random() - 0.5) * 0.002;

  return Math.max(0.002, competitiveBid + variation);
}

// Submit bid
async function submitBid(intent: Intent): Promise<void> {
  if (!providerId) return;
  if (!intent.type.startsWith('news')) return;

  const bidAmount = calculateBidAmount(intent);
  const estimatedTime = 800 + Math.floor(Math.random() * 700); // 800-1500ms

  console.log(`📤 Submitting bid for intent ${intent.id}: $${bidAmount.toFixed(4)}`);

  try {
    const response = await fetch(`${SYNAPSE_API_URL}/api/intents/${intent.id}/bid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bidAmount,
        estimatedTime,
        confidence: 90,
        providerAddress: PROVIDER_ADDRESS,
        providerId,
        reputationScore: 4.5,
        teeAttested: false,
        capabilities: ['news.latest', 'news.search']
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

// Execute intent
async function executeIntent(intent: Intent): Promise<void> {
  console.log(`🚀 Executing intent ${intent.id}...`);

  const startTime = Date.now();

  try {
    const topic = (intent.params.topic as string) ||
                  (intent.params.query as string) ||
                  (intent.params.category as string) || 'default';
    const limit = (intent.params.limit as number) || 5;

    // Simulate news aggregation time
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));

    const articles = getNews(topic, limit);
    const executionTime = Date.now() - startTime;

    console.log(`📰 Found ${articles.length} articles for "${topic}"`);

    const response = await fetch(`${SYNAPSE_API_URL}/api/intents/${intent.id}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          topic,
          articleCount: articles.length,
          articles,
          timestamp: Date.now()
        },
        providerId: PROVIDER_ADDRESS,
        executionTime,
        proof: `news_proof_${nanoid(16)}`
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
        description: 'Comprehensive news aggregation from 100+ sources',
        capabilities: ['news.latest', 'news.search'],
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

  socket = SocketIOClient(SYNAPSE_API_URL);

  socket.on('connect', () => {
    console.log('✅ WebSocket connected');
    socket!.emit(WSEventType.SUBSCRIBE_PROVIDER, {
      providerId,
      address: PROVIDER_ADDRESS,
      capabilities: ['news.latest', 'news.search']
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
  if (!intent.type.startsWith('news')) return;

  console.log(`📋 Intent ${intent.id}: ${intent.type} (Budget: $${intent.maxBudget})`);
  submitBid(intent);
}

// Express app
const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', provider: PROVIDER_NAME, providerId });
});

app.get('/api/news', (req, res) => {
  const topic = (req.query.topic as string) || 'default';
  const limit = parseInt(req.query.limit as string) || 5;
  res.json({
    topic,
    articles: getNews(topic, limit),
    timestamp: Date.now()
  });
});

// Start server
app.listen(PORT, async () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   📰 NEWS BOT PROVIDER                                        ║
║                                                               ║
║   Name: ${PROVIDER_NAME.padEnd(50)}║
║   Address: ${PROVIDER_ADDRESS.padEnd(47)}║
║   Capabilities: news.latest, news.search                      ║
║                                                               ║
║   Local API: http://localhost:${PORT}/api/news                  ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  await connectToSynapse();
});
