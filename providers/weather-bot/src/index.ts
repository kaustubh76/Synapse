// ============================================================
// SYNAPSE Weather Bot Provider
// Provides weather data and bids on weather-related intents
// x402 enabled for direct API access with real payment support
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
import {
  // x402 production middleware
  x402ProductionMiddleware,
  type X402ProductionConfig,
  // Facilitator for payment settlement
  getDefaultFacilitator,
  type X402Facilitator
} from '@synapse/core';

dotenv.config();

// Configuration
const PORT = process.env.PORT || 3010;
const SYNAPSE_API_URL = process.env.SYNAPSE_API_URL || 'http://localhost:3001';
const PROVIDER_ADDRESS = process.env.PROVIDER_ADDRESS || `0xWeatherBot_${nanoid(8)}`;
const PROVIDER_NAME = 'WeatherBot Pro';

// Provider state
let providerId: string | null = null;
let socket: Socket | null = null;

// Simulated weather data
const weatherData: Record<string, { temp: number; humidity: number; condition: string }> = {
  'new york': { temp: 72, humidity: 45, condition: 'Sunny' },
  'nyc': { temp: 72, humidity: 45, condition: 'Sunny' },
  'london': { temp: 55, humidity: 80, condition: 'Cloudy' },
  'tokyo': { temp: 68, humidity: 60, condition: 'Partly Cloudy' },
  'paris': { temp: 62, humidity: 55, condition: 'Clear' },
  'sydney': { temp: 78, humidity: 50, condition: 'Sunny' },
  'mumbai': { temp: 88, humidity: 75, condition: 'Humid' },
  'dubai': { temp: 95, humidity: 30, condition: 'Hot' },
  'singapore': { temp: 86, humidity: 85, condition: 'Tropical' },
  'berlin': { temp: 58, humidity: 65, condition: 'Overcast' }
};

// Get weather for a city
function getWeather(city: string): { temp: number; humidity: number; condition: string; city: string } {
  const normalizedCity = city.toLowerCase().trim();
  const data = weatherData[normalizedCity] || {
    temp: Math.floor(Math.random() * 40) + 40,
    humidity: Math.floor(Math.random() * 60) + 30,
    condition: ['Sunny', 'Cloudy', 'Rainy', 'Clear'][Math.floor(Math.random() * 4)]
  };
  return { ...data, city };
}

// Calculate bid amount based on intent and competition
function calculateBidAmount(intent: Intent): number {
  const baseBid = 0.005; // $0.005 base
  const maxBudget = intent.maxBudget;

  // Bid slightly below max budget for better chance
  const competitiveBid = Math.min(baseBid, maxBudget * 0.4);

  // Add small random variation
  const variation = (Math.random() - 0.5) * 0.002;

  return Math.max(0.001, competitiveBid + variation);
}

// Submit bid for an intent
async function submitBid(intent: Intent): Promise<void> {
  if (!providerId) {
    console.log('Provider not registered yet');
    return;
  }

  // Check if we can handle this intent
  if (!intent.type.startsWith('weather')) {
    return;
  }

  const bidAmount = calculateBidAmount(intent);
  const estimatedTime = 500 + Math.floor(Math.random() * 500); // 500-1000ms

  console.log(`📤 Submitting bid for intent ${intent.id}: $${bidAmount.toFixed(4)}`);

  try {
    const response = await fetch(`${SYNAPSE_API_URL}/api/intents/${intent.id}/bid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bidAmount,
        estimatedTime,
        confidence: 95,
        providerAddress: PROVIDER_ADDRESS,
        providerId,
        reputationScore: 4.8,
        teeAttested: false,
        capabilities: ['weather.current', 'weather.forecast']
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

// Execute an intent and submit result
async function executeIntent(intent: Intent): Promise<void> {
  console.log(`🚀 Executing intent ${intent.id}...`);

  const startTime = Date.now();

  try {
    // Extract city from params
    const city = (intent.params.city as string) || (intent.params.location as string) || 'New York';

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 400));

    // Get weather data
    const weather = getWeather(city);
    const executionTime = Date.now() - startTime;

    console.log(`📊 Weather for ${city}: ${weather.temp}°F, ${weather.condition}`);

    // Submit result
    const response = await fetch(`${SYNAPSE_API_URL}/api/intents/${intent.id}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          city: weather.city,
          temperature: weather.temp,
          humidity: weather.humidity,
          condition: weather.condition,
          unit: 'fahrenheit',
          timestamp: Date.now()
        },
        providerId: PROVIDER_ADDRESS,
        executionTime,
        proof: `weather_proof_${nanoid(16)}`
      })
    });

    const result = await response.json();
    if (result.success) {
      console.log(`✅ Result submitted for intent ${intent.id}`);

      // Simulate x402 payment
      await simulatePayment(intent.id);
    } else {
      console.log(`❌ Result rejected: ${result.error?.message}`);
    }
  } catch (error) {
    console.error('Error executing intent:', error);
  }
}

// Simulate x402 payment settlement
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

// Connect to Synapse network
async function connectToSynapse(): Promise<void> {
  console.log(`Connecting to Synapse at ${SYNAPSE_API_URL}...`);

  // Register provider
  try {
    const response = await fetch(`${SYNAPSE_API_URL}/api/providers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: PROVIDER_NAME,
        description: 'Premium weather data provider with global coverage',
        capabilities: ['weather.current', 'weather.forecast'],
        endpoint: `http://localhost:${PORT}/api`,
        address: PROVIDER_ADDRESS
      })
    });

    const result = await response.json();
    if (result.success) {
      providerId = result.data.id;
      console.log(`✅ Provider registered: ${providerId}`);
    } else {
      console.error('Failed to register provider:', result.error);
    }
  } catch (error) {
    console.error('Error registering provider:', error);
  }

  // Connect WebSocket
  socket = SocketIOClient(SYNAPSE_API_URL);

  socket.on('connect', () => {
    console.log('✅ WebSocket connected');

    // Subscribe as provider
    socket!.emit(WSEventType.SUBSCRIBE_PROVIDER, {
      providerId,
      address: PROVIDER_ADDRESS,
      capabilities: ['weather.current', 'weather.forecast']
    });

    // Send heartbeat every 15 seconds to stay online
    setInterval(() => {
      if (socket?.connected) {
        socket.emit('heartbeat');
      }
    }, 15000);
  });

  // Listen for new intents
  socket.on(WSEventType.NEW_INTENT_AVAILABLE, (message: WSMessage<{ intent?: Intent; intents?: Intent[] }>) => {
    console.log(`📥 New intent available`);

    if (message.payload?.intent) {
      handleNewIntent(message.payload.intent);
    }
    if (message.payload?.intents) {
      message.payload.intents.forEach(handleNewIntent);
    }
  });

  // Listen for intent assignment (we won!)
  socket.on(WSEventType.INTENT_ASSIGNED, (message: WSMessage<{ intent: Intent; bid: Bid }>) => {
    // Only execute if we are the assigned provider
    if (message.payload?.intent && message.payload?.bid?.providerAddress === PROVIDER_ADDRESS) {
      console.log(`🎉 We won intent ${message.payload.intent.id}!`);
      executeIntent(message.payload.intent);
    }
  });

  // Listen for winner selection
  socket.on(WSEventType.WINNER_SELECTED, (message: WSMessage<{ winner: Bid; intent: Intent }>) => {
    if (message.payload?.winner?.providerAddress === PROVIDER_ADDRESS) {
      console.log(`🎉 We won intent ${message.payload.intent.id}!`);
      executeIntent(message.payload.intent);
    } else if (message.payload?.intent) {
      console.log(`😔 Lost intent ${message.payload.intent.id} to ${message.payload.winner?.providerAddress}`);
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ WebSocket disconnected');
  });

  socket.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
}

// Handle new intent
function handleNewIntent(intent: Intent): void {
  if (intent.status !== IntentStatus.OPEN) return;
  if (!intent.type.startsWith('weather')) return;

  console.log(`📋 Intent ${intent.id}: ${intent.type} (Budget: $${intent.maxBudget})`);
  submitBid(intent);
}

// Create Express app for direct API calls
const app = express();
app.use(express.json());

// x402 facilitator for payment verification and settlement
let facilitator: X402Facilitator;

// Initialize x402 facilitator
async function initializeFacilitator(): Promise<void> {
  facilitator = getDefaultFacilitator();
  const demoMode = process.env.X402_DEMO_MODE !== 'false';
  console.log(`💳 x402 facilitator initialized (demo: ${demoMode})`);
}

// x402 configuration for direct API access
const x402Config: X402ProductionConfig = {
  price: '5000', // $0.005 in USDC (6 decimals = 5000 micro-USDC)
  network: (process.env.X402_NETWORK as 'base' | 'base-sepolia') || 'base-sepolia',
  recipient: PROVIDER_ADDRESS,
  description: 'WeatherBot Pro - Premium weather data',
  demoMode: process.env.X402_DEMO_MODE !== 'false'
};

// Health check (free)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', provider: PROVIDER_NAME, providerId });
});

// Direct weather API (x402 protected with production middleware)
// Clients must include X-Payment header with valid payment proof
app.get('/api/weather',
  x402ProductionMiddleware(x402Config),
  (req, res) => {
    const city = (req.query.city as string) || 'New York';
    const weather = getWeather(city);

    // Include payment info in response
    const paymentInfo = (req as any).x402Payment;

    res.json({
      ...weather,
      x402: paymentInfo ? {
        paid: true,
        verified: paymentInfo.verified,
        txHash: paymentInfo.txHash,
        amount: paymentInfo.amount,
        settled: paymentInfo.settled || false
      } : { paid: false }
    });
  }
);

// Free preview endpoint (limited data)
app.get('/api/weather/preview', (req, res) => {
  const city = (req.query.city as string) || 'New York';
  const weather = getWeather(city);
  res.json({
    city: weather.city,
    condition: weather.condition,
    note: 'Upgrade to x402 for full data including temperature and humidity'
  });
});

// Start server
app.listen(PORT, async () => {
  const demoMode = process.env.X402_DEMO_MODE !== 'false';

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🌤️  WEATHER BOT PROVIDER                                    ║
║                                                               ║
║   Name: ${PROVIDER_NAME.padEnd(50)}║
║   Address: ${PROVIDER_ADDRESS.padEnd(47)}║
║   Capabilities: weather.current, weather.forecast             ║
║                                                               ║
║   Local API: http://localhost:${PORT}/api/weather               ║
║   x402 Mode: ${(demoMode ? 'DEMO' : 'PRODUCTION').padEnd(45)}║
║   Network: ${(x402Config.network).padEnd(47)}║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  // Initialize x402 facilitator
  await initializeFacilitator();

  // Connect to Synapse network
  await connectToSynapse();
});
