#!/usr/bin/env npx ts-node
// ============================================================
// SYNAPSE Weather Bot
// A provider bot that handles weather data requests
// ============================================================

/* eslint-disable @typescript-eslint/no-var-requires */
const { createProvider } = require('@synapse/sdk');
type SynapseProvider = ReturnType<typeof createProvider>;
interface ExecutionResult<T = unknown> { success: boolean; data?: T; error?: string; executionTime?: number; }

const API_URL = process.env.SYNAPSE_API_URL || 'http://localhost:3001';

// Mock weather data generator
function getWeatherData(city: string): {
  city: string;
  temperature: number;
  humidity: number;
  conditions: string;
  windSpeed: number;
  timestamp: string;
} {
  // Simulate different weather for different cities
  const cityWeather: Record<string, { temp: number; conditions: string }> = {
    'new york': { temp: 45, conditions: 'Cloudy' },
    'los angeles': { temp: 72, conditions: 'Sunny' },
    'san francisco': { temp: 58, conditions: 'Foggy' },
    'miami': { temp: 82, conditions: 'Humid' },
    'chicago': { temp: 38, conditions: 'Windy' },
    'seattle': { temp: 52, conditions: 'Rainy' },
    'denver': { temp: 55, conditions: 'Clear' },
    'boston': { temp: 42, conditions: 'Partly Cloudy' }
  };

  const normalizedCity = city.toLowerCase();
  const weather = cityWeather[normalizedCity] || {
    temp: Math.floor(Math.random() * 40) + 40,
    conditions: ['Sunny', 'Cloudy', 'Rainy', 'Clear'][Math.floor(Math.random() * 4)]
  };

  return {
    city,
    temperature: weather.temp + Math.floor(Math.random() * 6) - 3, // Add some variation
    humidity: Math.floor(Math.random() * 40) + 40,
    conditions: weather.conditions,
    windSpeed: Math.floor(Math.random() * 20) + 5,
    timestamp: new Date().toISOString()
  };
}

// Get forecast data
function getForecastData(city: string, days: number = 5): Array<{
  date: string;
  high: number;
  low: number;
  conditions: string;
}> {
  const forecast = [];
  const baseTemp = Math.floor(Math.random() * 30) + 50;

  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i + 1);

    forecast.push({
      date: date.toISOString().split('T')[0],
      high: baseTemp + Math.floor(Math.random() * 10),
      low: baseTemp - Math.floor(Math.random() * 15),
      conditions: ['Sunny', 'Cloudy', 'Rainy', 'Clear', 'Partly Cloudy'][Math.floor(Math.random() * 5)]
    });
  }

  return forecast;
}

async function main() {
  console.log('🌤️  Starting Synapse Weather Bot...');
  console.log(`📡 Connecting to: ${API_URL}`);

  const provider = createProvider({
    apiUrl: API_URL,
    name: 'WeatherBot Pro',
    description: 'Premium weather data provider with global coverage and high accuracy',
    capabilities: ['weather.current', 'weather.forecast'],
    endpoint: 'http://localhost:3010/api'
  });

  // Set competitive bid strategy
  provider.setBidStrategy({
    baseBid: 0.006,
    budgetPercentage: 0.35,
    minBid: 0.003,
    maxBid: 0.015,
    confidence: 95,
    estimatedTime: 300
  });

  // Handle current weather requests
  provider.onIntent<ReturnType<typeof getWeatherData>>('weather.current', async (intent, params) => {
    const city = (params.city as string) || 'New York';
    console.log(`📍 Getting weather for: ${city}`);

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    const data = getWeatherData(city);

    return {
      success: true,
      data,
      executionTime: 150
    };
  });

  // Handle forecast requests
  provider.onIntent('weather.forecast', async (intent, params) => {
    const city = (params.city as string) || 'New York';
    const days = (params.days as number) || 5;
    console.log(`📅 Getting ${days}-day forecast for: ${city}`);

    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

    const current = getWeatherData(city);
    const forecast = getForecastData(city, days);

    return {
      success: true,
      data: {
        city,
        current,
        forecast
      },
      executionTime: 350
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
    console.log(`📬 Intent received: ${intent.type} (Budget: $${intent.maxBudget})`);
  });

  provider.on('bidSubmitted', (bid) => {
    console.log(`💰 Bid submitted: $${bid.bidAmount.toFixed(4)} (Score: ${bid.calculatedScore?.toFixed(3)})`);
  });

  provider.on('intentAssigned', (intent) => {
    console.log(`🎯 WON intent: ${intent.id}`);
  });

  provider.on('executionCompleted', (intent, result) => {
    console.log(`✅ Completed: ${intent.type}`);
    console.log(`   Result: ${JSON.stringify(result).substring(0, 100)}...`);
  });

  provider.on('paymentReceived', (amount, txHash) => {
    console.log(`💵 Payment: $${amount.toFixed(4)} (tx: ${txHash.substring(0, 20)}...)`);
  });

  provider.on('error', (error) => {
    console.error('❌ Error:', error);
  });

  // Start the provider
  try {
    await provider.start();
    console.log('');
    console.log('🌤️  Weather Bot is running!');
    console.log('   Waiting for weather intents...');
    console.log('');
    console.log('   Press Ctrl+C to stop');
    console.log('');

    // Keep alive and show stats periodically
    setInterval(() => {
      const stats = provider.getStats();
      if (stats.intentsReceived > 0) {
        console.log(`📊 Stats: ${stats.intentsReceived} received, ${stats.bidsWon} won, $${stats.totalEarnings.toFixed(4)} earned`);
      }
    }, 30000);

  } catch (error) {
    console.error('Failed to start Weather Bot:', error);
    process.exit(1);
  }
}

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Weather Bot...');
  process.exit(0);
});

main();
