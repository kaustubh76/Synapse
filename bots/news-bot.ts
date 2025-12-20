#!/usr/bin/env npx ts-node
// ============================================================
// SYNAPSE News Bot
// A provider bot that handles news aggregation requests
// ============================================================

/* eslint-disable @typescript-eslint/no-var-requires */
const { createProvider } = require('@synapse/sdk');

const API_URL = process.env.SYNAPSE_API_URL || 'http://localhost:3001';

// Mock news data
const NEWS_TOPICS: Record<string, string[]> = {
  technology: [
    'Apple Announces New AI Features for iPhone',
    'OpenAI Releases GPT-5 with Enhanced Reasoning',
    'Tesla Unveils Next-Gen Autopilot System',
    'Microsoft Azure Expands Cloud AI Services',
    'Google Quantum Computer Achieves New Milestone'
  ],
  crypto: [
    'Bitcoin Surges Past $100K Amid ETF Inflows',
    'Ethereum Layer 2 Solutions See Record Growth',
    'SEC Approves More Crypto ETF Applications',
    'DeFi Total Value Locked Reaches New All-Time High',
    'Major Bank Launches Crypto Custody Service'
  ],
  finance: [
    'Federal Reserve Signals Rate Decision',
    'S&P 500 Hits New Record High',
    'Tech Stocks Lead Market Rally',
    'Global Markets React to Economic Data',
    'AI Stocks Continue Strong Performance'
  ],
  ai: [
    'Anthropic Releases Claude 4 with Advanced Capabilities',
    'AI Agents Transform Enterprise Workflows',
    'New AI Regulations Proposed in EU',
    'AI Drug Discovery Breakthrough Announced',
    'OpenAI and Microsoft Expand Partnership'
  ],
  general: [
    'Global Leaders Meet for Climate Summit',
    'Space Mission Successfully Launches',
    'New Scientific Discovery Announced',
    'International Trade Agreement Reached',
    'Major Infrastructure Project Completed'
  ]
};

const SOURCES = ['Reuters', 'Bloomberg', 'TechCrunch', 'CoinDesk', 'The Verge', 'WSJ', 'NYT', 'Forbes'];

function generateNews(topic: string = 'general', count: number = 5): Array<{
  id: string;
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
  url: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}> {
  const normalizedTopic = topic.toLowerCase();
  const headlines = NEWS_TOPICS[normalizedTopic] || NEWS_TOPICS.general;

  const news = [];
  const shuffled = [...headlines].sort(() => Math.random() - 0.5);

  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    const hoursAgo = Math.floor(Math.random() * 24);
    const publishedAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

    news.push({
      id: `news_${Date.now()}_${i}`,
      title: shuffled[i],
      summary: `This is a summary of the news article about ${topic}. ` +
               `The article discusses key developments and their implications for the industry.`,
      source: SOURCES[Math.floor(Math.random() * SOURCES.length)],
      publishedAt: publishedAt.toISOString(),
      url: `https://news.example.com/article/${Date.now()}_${i}`,
      sentiment: ['positive', 'negative', 'neutral'][Math.floor(Math.random() * 3)] as 'positive' | 'negative' | 'neutral'
    });
  }

  return news;
}

function searchNews(query: string, limit: number = 10): Array<{
  id: string;
  title: string;
  snippet: string;
  source: string;
  publishedAt: string;
  relevanceScore: number;
}> {
  const results = [];
  const allHeadlines = Object.values(NEWS_TOPICS).flat();

  // Filter headlines that might match the query
  const matchingHeadlines = allHeadlines.filter(h =>
    h.toLowerCase().includes(query.toLowerCase()) ||
    query.toLowerCase().split(' ').some(word => h.toLowerCase().includes(word))
  );

  // Add some random headlines if not enough matches
  const headlines = matchingHeadlines.length >= limit
    ? matchingHeadlines.slice(0, limit)
    : [...matchingHeadlines, ...allHeadlines.slice(0, limit - matchingHeadlines.length)];

  for (let i = 0; i < Math.min(limit, headlines.length); i++) {
    const hoursAgo = Math.floor(Math.random() * 48);
    const publishedAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

    results.push({
      id: `search_${Date.now()}_${i}`,
      title: headlines[i],
      snippet: `...relevant excerpt containing "${query}" and related information...`,
      source: SOURCES[Math.floor(Math.random() * SOURCES.length)],
      publishedAt: publishedAt.toISOString(),
      relevanceScore: Math.round((1 - i / limit) * 100) / 100
    });
  }

  return results;
}

async function main() {
  console.log('📰 Starting Synapse News Bot...');
  console.log(`📡 Connecting to: ${API_URL}`);

  const provider = createProvider({
    apiUrl: API_URL,
    name: 'NewsAggregator Pro',
    description: 'Comprehensive news aggregation from 100+ sources with sentiment analysis',
    capabilities: ['news.latest', 'news.search'],
    endpoint: 'http://localhost:3030/api'
  });

  // Slightly higher pricing for comprehensive news
  provider.setBidStrategy({
    baseBid: 0.008,
    budgetPercentage: 0.4,
    minBid: 0.005,
    maxBid: 0.025,
    confidence: 92,
    estimatedTime: 500
  });

  provider.setReputationScore(4.3);

  // Handle latest news requests
  provider.onIntent('news.latest', async (intent, params) => {
    const topic = (params.topic as string) || 'general';
    const count = (params.count as number) || 5;
    console.log(`📰 Getting latest ${topic} news (${count} articles)`);

    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

    const articles = generateNews(topic, count);

    return {
      success: true,
      data: {
        topic,
        articles,
        totalResults: articles.length,
        fetchedAt: new Date().toISOString()
      },
      executionTime: 400
    };
  });

  // Handle news search
  provider.onIntent('news.search', async (intent, params) => {
    const query = (params.query as string) || '';
    const limit = (params.limit as number) || 10;
    console.log(`🔍 Searching news for: "${query}" (limit: ${limit})`);

    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 400));

    const results = searchNews(query, limit);

    return {
      success: true,
      data: {
        query,
        results,
        totalResults: results.length,
        searchedAt: new Date().toISOString()
      },
      executionTime: 550
    };
  });

  // Event handlers
  provider.on('connected', () => console.log('✅ Connected'));
  provider.on('registered', (id) => {
    console.log(`✅ Registered: ${id}`);
    console.log(`💳 Wallet: ${provider.getWalletAddress()}`);
  });
  provider.on('intentReceived', (i) => console.log(`📬 Intent: ${i.type}`));
  provider.on('bidSubmitted', (b) => console.log(`💰 Bid: $${b.bidAmount.toFixed(4)}`));
  provider.on('intentAssigned', (i) => console.log(`🎯 WON: ${i.id}`));
  provider.on('executionCompleted', (i, r) => console.log(`✅ Done: ${i.type}`));
  provider.on('paymentReceived', (a) => console.log(`💵 Paid: $${a.toFixed(4)}`));
  provider.on('error', (e) => console.error('❌', e));

  try {
    await provider.start();
    console.log('');
    console.log('📰 News Bot is running!');
    console.log('   Waiting for news intents...');
    console.log('   Press Ctrl+C to stop');
    console.log('');

    setInterval(() => {
      const s = provider.getStats();
      if (s.intentsReceived > 0) {
        console.log(`📊 ${s.bidsWon}/${s.intentsReceived} won, $${s.totalEarnings.toFixed(4)} earned`);
      }
    }, 30000);

  } catch (error) {
    console.error('Failed to start News Bot:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down News Bot...');
  process.exit(0);
});

main();
