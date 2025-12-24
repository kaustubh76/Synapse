// ============================================================
// SYNAPSE API SERVER
// Main entry point for the backend
// ============================================================

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import { setupIntentRoutes } from './routes/intents.js';
import { setupProviderRoutes } from './routes/providers.js';
import { setupPaymentRoutes } from './routes/payments.js';
import { setupDecompositionRoutes } from './routes/decomposition.js';
import { setupAgentRoutes } from './routes/agents.js';
import { setupEscrowRoutes } from './routes/escrow.js';
import { setupDisputeRoutes } from './routes/disputes.js';
import { setupWalletRoutes } from './routes/wallet.js';
import { setupWebSocket } from './websocket/index.js';
import { setupEngineEvents } from './events/engine-events.js';
import { getIntentEngine, getProviderRegistry } from '@synapse/core';
import { seedDemoProviders } from './seed/demo-providers.js';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

async function main() {
  // Create Express app
  const app = express();
  const httpServer = createServer(app);

  // Create Socket.IO server
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: CORS_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Middleware
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }));
  app.use(cors({
    origin: CORS_ORIGIN,
    credentials: true
  }));
  app.use(express.json());

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: Date.now(),
      version: '0.1.0'
    });
  });

  // Initialize core engines early so we can use them in stats endpoint
  const intentEngine = getIntentEngine();
  const providerRegistry = getProviderRegistry();

  // Network stats endpoint for dashboard
  app.get('/api/network/stats', (req, res) => {
    const providerStats = providerRegistry.getStats();
    const openIntents = intentEngine.getOpenIntents();
    const allProviders = providerRegistry.getAllProviders();

    // Calculate totals from providers
    let totalVolume = 0;
    let totalIntentsCompleted = 0;
    let totalIntentsFailed = 0;
    let totalResponseTime = 0;
    let responseTimeCount = 0;

    allProviders.forEach(p => {
      totalVolume += p.totalEarnings || 0;
      totalIntentsCompleted += p.successfulJobs || 0;
      totalIntentsFailed += (p.totalJobs - p.successfulJobs) || 0;
      if (p.avgResponseTime > 0) {
        totalResponseTime += p.avgResponseTime;
        responseTimeCount++;
      }
    });

    const avgResponseTime = responseTimeCount > 0 ? Math.round(totalResponseTime / responseTimeCount) : 500;
    const successRate = totalIntentsCompleted + totalIntentsFailed > 0
      ? Math.round((totalIntentsCompleted / (totalIntentsCompleted + totalIntentsFailed)) * 100)
      : 95;

    res.json({
      success: true,
      data: {
        providersOnline: providerStats.online,
        providersTotal: providerStats.total,
        intentsPending: openIntents.length,
        intentsCompleted: totalIntentsCompleted,
        intentsFailed: totalIntentsFailed,
        totalVolume: totalVolume,
        avgResponseTime: avgResponseTime,
        avgSavings: 35, // Average savings percentage (demo value)
        successRate: successRate,
        avgReputation: providerStats.avgReputation,
        capabilityCounts: providerStats.capabilityCounts
      },
      timestamp: Date.now()
    });
  });

  // API info
  app.get('/', (req, res) => {
    res.json({
      name: 'Synapse Intent Network API',
      version: '0.1.0',
      description: 'Decentralized Intent Network for AI Agents',
      endpoints: {
        intents: '/api/intents',
        providers: '/api/providers',
        payments: '/api/payments',
        decomposition: '/api/decomposition',
        agents: '/api/agents',
        escrow: '/api/escrow',
        disputes: '/api/disputes',
        wallet: '/api/wallet',
        websocket: 'ws://localhost:' + PORT
      }
    });
  });

  // Setup routes
  setupIntentRoutes(app, intentEngine, io);
  setupProviderRoutes(app, providerRegistry, io);
  setupPaymentRoutes(app, intentEngine);
  setupDecompositionRoutes(app, io);
  setupAgentRoutes(app, io);
  setupEscrowRoutes(app, io);
  setupDisputeRoutes(app, io);
  setupWalletRoutes(app);

  // Setup WebSocket handlers
  setupWebSocket(io, intentEngine, providerRegistry);

  // Setup engine event broadcasting
  setupEngineEvents(intentEngine, providerRegistry, io);

  // Seed demo providers for testing (disable with SKIP_DEMO_PROVIDERS=true)
  if (!process.env.SKIP_DEMO_PROVIDERS) {
    seedDemoProviders(providerRegistry);
  } else {
    console.log('Skipping demo provider seeding (SKIP_DEMO_PROVIDERS=true)');
  }

  // Error handler
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
      },
      timestamp: Date.now()
    });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${req.method} ${req.path} not found`
      },
      timestamp: Date.now()
    });
  });

  // Start server
  httpServer.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                                                                    ║
║   🧠 SYNAPSE INTENT NETWORK API                                    ║
║                                                                    ║
║   Server running on http://localhost:${PORT}                         ║
║   WebSocket available on ws://localhost:${PORT}                      ║
║                                                                    ║
║   Core Endpoints:                                                  ║
║   • POST /api/intents              - Create new intent             ║
║   • GET  /api/intents              - List intents                  ║
║   • POST /api/intents/:id/bid      - Submit bid                    ║
║   • GET  /api/providers            - List providers                ║
║   • POST /api/providers            - Register provider             ║
║                                                                    ║
║   Decomposition:                                                   ║
║   • POST /api/decomposition/check     - Check if should decompose  ║
║   • POST /api/decomposition/decompose - Create plan                ║
║   • POST /api/decomposition/plans/:id/start - Start execution      ║
║                                                                    ║
║   Agent Identity (ERC-8004):                                       ║
║   • POST /api/agents/register      - Register agent                ║
║   • GET  /api/agents/:id           - Get agent profile             ║
║   • POST /api/agents/:id/stake     - Deposit stake                 ║
║   • POST /api/agents/feedback      - Submit feedback               ║
║                                                                    ║
║   Escrow & Disputes:                                               ║
║   • POST /api/escrow               - Create escrow                 ║
║   • POST /api/escrow/:id/release   - Release funds                 ║
║   • POST /api/disputes             - Open dispute                  ║
║   • POST /api/disputes/:id/evidence - Add evidence                 ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
    `);
  });
}

main().catch(console.error);
