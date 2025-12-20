#!/usr/bin/env npx ts-node
// ============================================================
// Run All Synapse Provider Bots
// Starts weather, crypto, and news bots for testing
// ============================================================

/* eslint-disable @typescript-eslint/no-var-requires */
const { createProvider } = require('@synapse/sdk');
type SynapseProvider = ReturnType<typeof createProvider>;

const API_URL = process.env.SYNAPSE_API_URL || 'http://localhost:3001';

// -------------------- WEATHER BOT --------------------
function createWeatherBot(): SynapseProvider {
  const provider = createProvider({
    apiUrl: API_URL,
    name: 'WeatherBot Pro',
    description: 'Premium weather data provider',
    capabilities: ['weather.current', 'weather.forecast'],
    endpoint: 'http://localhost:3010/api'
  });

  provider.setBidStrategy({
    baseBid: 0.006,
    budgetPercentage: 0.35,
    minBid: 0.003,
    confidence: 95,
    estimatedTime: 300
  });

  provider.onIntent('weather.current', async (intent, params) => {
    const city = (params.city as string) || 'New York';
    await new Promise(r => setTimeout(r, 100 + Math.random() * 200));

    const temps: Record<string, number> = {
      'new york': 45, 'san francisco': 58, 'miami': 82, 'los angeles': 72
    };
    const temp = temps[city.toLowerCase()] || (Math.random() * 40 + 40);

    return {
      success: true,
      data: {
        city,
        temperature: Math.round(temp + (Math.random() - 0.5) * 6),
        humidity: Math.floor(Math.random() * 40 + 40),
        conditions: ['Sunny', 'Cloudy', 'Clear', 'Rainy'][Math.floor(Math.random() * 4)],
        timestamp: new Date().toISOString()
      }
    };
  });

  provider.onIntent('weather.forecast', async (intent, params) => {
    const city = (params.city as string) || 'New York';
    await new Promise(r => setTimeout(r, 200 + Math.random() * 300));

    const forecast = [];
    for (let i = 0; i < 5; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i + 1);
      forecast.push({
        date: date.toISOString().split('T')[0],
        high: Math.round(70 + Math.random() * 15),
        low: Math.round(50 + Math.random() * 10),
        conditions: ['Sunny', 'Cloudy', 'Clear'][Math.floor(Math.random() * 3)]
      });
    }

    return { success: true, data: { city, forecast } };
  });

  return provider;
}

// -------------------- CRYPTO BOT --------------------
function createCryptoBot(): SynapseProvider {
  const provider = createProvider({
    apiUrl: API_URL,
    name: 'CryptoOracle',
    description: 'Real-time cryptocurrency prices',
    capabilities: ['crypto.price', 'crypto.history'],
    endpoint: 'http://localhost:3020/api'
  });

  provider.setBidStrategy({
    baseBid: 0.004,
    budgetPercentage: 0.25,
    minBid: 0.002,
    confidence: 98,
    estimatedTime: 200
  });

  provider.setReputationScore(4.8);

  const PRICES: Record<string, number> = {
    BTC: 98500, ETH: 3450, SOL: 195, BNB: 625, XRP: 2.15, DOGE: 0.38
  };

  provider.onIntent('crypto.price', async (intent, params) => {
    const symbol = ((params.symbol as string) || 'BTC').toUpperCase();
    await new Promise(r => setTimeout(r, 50 + Math.random() * 100));

    const basePrice = PRICES[symbol] || Math.random() * 100;
    const price = basePrice * (1 + (Math.random() - 0.5) * 0.002);

    return {
      success: true,
      data: {
        symbol,
        price: Math.round(price * 100) / 100,
        change24h: Math.round((Math.random() - 0.5) * 10 * 100) / 100,
        timestamp: new Date().toISOString()
      }
    };
  });

  provider.onIntent('crypto.history', async (intent, params) => {
    const symbol = ((params.symbol as string) || 'BTC').toUpperCase();
    const days = (params.days as number) || 7;
    await new Promise(r => setTimeout(r, 100 + Math.random() * 150));

    const basePrice = PRICES[symbol] || 100;
    const history = [];
    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const price = basePrice * (1 + (Math.random() - 0.5) * 0.1);
      history.push({
        date: date.toISOString().split('T')[0],
        close: Math.round(price * 100) / 100
      });
    }

    return { success: true, data: { symbol, history } };
  });

  return provider;
}

// -------------------- NEWS BOT --------------------
function createNewsBot(): SynapseProvider {
  const provider = createProvider({
    apiUrl: API_URL,
    name: 'NewsAggregator Pro',
    description: 'Comprehensive news from 100+ sources',
    capabilities: ['news.latest', 'news.search'],
    endpoint: 'http://localhost:3030/api'
  });

  provider.setBidStrategy({
    baseBid: 0.008,
    budgetPercentage: 0.4,
    minBid: 0.005,
    confidence: 92,
    estimatedTime: 500
  });

  const headlines = [
    'AI Revolution Continues to Transform Industries',
    'Crypto Markets See Strong Growth',
    'Tech Giants Report Record Earnings',
    'Global Economic Outlook Improves',
    'New Scientific Breakthrough Announced'
  ];

  provider.onIntent('news.latest', async (intent, params) => {
    const topic = (params.topic as string) || 'general';
    await new Promise(r => setTimeout(r, 200 + Math.random() * 300));

    const articles = headlines.slice(0, 5).map((title, i) => ({
      id: `news_${Date.now()}_${i}`,
      title,
      source: ['Reuters', 'Bloomberg', 'TechCrunch'][i % 3],
      publishedAt: new Date(Date.now() - i * 3600000).toISOString()
    }));

    return { success: true, data: { topic, articles } };
  });

  provider.onIntent('news.search', async (intent, params) => {
    const query = (params.query as string) || '';
    await new Promise(r => setTimeout(r, 300 + Math.random() * 400));

    return {
      success: true,
      data: {
        query,
        results: headlines.map((title, i) => ({
          id: `search_${i}`,
          title,
          relevance: Math.round((1 - i / 5) * 100) / 100
        }))
      }
    };
  });

  return provider;
}

// -------------------- MAIN --------------------
async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║   🤖 SYNAPSE PROVIDER BOTS                                 ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📡 Connecting to: ${API_URL}`);
  console.log('');

  const bots: SynapseProvider[] = [];

  try {
    // Create and start all bots
    const weatherBot = createWeatherBot();
    const cryptoBot = createCryptoBot();
    const newsBot = createNewsBot();

    bots.push(weatherBot, cryptoBot, newsBot);

    // Add event listeners
    bots.forEach(bot => {
      bot.on('connected', () => console.log(`✅ ${bot['config'].name}: Connected`));
      bot.on('registered', (id) => console.log(`✅ ${bot['config'].name}: Registered (${id})`));
      bot.on('intentReceived', (i) => console.log(`📬 ${bot['config'].name}: Intent ${i.type}`));
      bot.on('intentAssigned', (i) => console.log(`🎯 ${bot['config'].name}: WON ${i.id}`));
      bot.on('executionCompleted', (i) => console.log(`✅ ${bot['config'].name}: Done ${i.type}`));
      bot.on('error', (e) => console.error(`❌ ${bot['config'].name}:`, e.message));
    });

    // Start all bots
    console.log('Starting bots...');
    console.log('');

    await Promise.all(bots.map(bot => bot.start()));

    console.log('');
    console.log('════════════════════════════════════════════════════════════');
    console.log('');
    console.log('🚀 All bots are running!');
    console.log('');
    console.log('   Capabilities available:');
    console.log('   • weather.current - Get current weather');
    console.log('   • weather.forecast - Get weather forecast');
    console.log('   • crypto.price - Get crypto prices');
    console.log('   • crypto.history - Get price history');
    console.log('   • news.latest - Get latest news');
    console.log('   • news.search - Search news');
    console.log('');
    console.log('   Press Ctrl+C to stop all bots');
    console.log('');

    // Stats display
    setInterval(() => {
      console.log('');
      console.log('📊 Bot Statistics:');
      bots.forEach(bot => {
        const s = bot.getStats();
        if (s.intentsReceived > 0) {
          console.log(`   ${bot['config'].name}: ${s.bidsWon}/${s.bidsMade} won, $${s.totalEarnings.toFixed(4)} earned`);
        }
      });
    }, 60000);

  } catch (error) {
    console.error('Failed to start bots:', error);
    process.exit(1);
  }
}

// Cleanup
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down all bots...');
  process.exit(0);
});

main();
