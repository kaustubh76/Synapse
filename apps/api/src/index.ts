// ============================================================
// SYNAPSE API SERVER
// Main entry point for the backend
// ============================================================

// CRITICAL: Load env vars BEFORE any other imports
// This ensures modules that read process.env at load time get the values
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env from project root (monorepo root, not apps/api)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '..', '..', '.env');
dotenv.config({ path: envPath });

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';

import { setupIntentRoutes } from './routes/intents.js';
import { setupProviderRoutes } from './routes/providers.js';
import { setupPaymentRoutes } from './routes/payments.js';
import { setupDecompositionRoutes } from './routes/decomposition.js';
import { setupAgentRoutes } from './routes/agents.js';
import { setupEscrowRoutes } from './routes/escrow.js';
import { setupDisputeRoutes } from './routes/disputes.js';
import { setupWalletRoutes } from './routes/wallet.js';
import llmRoutes from './routes/llm.js';
import { setupMCPRoutes } from './routes/mcp.js';
import { setupFlowRoutes } from './routes/flow.js';
import { setupPaymentVerificationRoutes } from './routes/payment-verification.js';
import { setupWebSocket } from './websocket/index.js';
import { setupEngineEvents } from './events/engine-events.js';
import { getIntentEngine, getProviderRegistry, getLLMExecutionEngine, getAgentCreditScorer, validateAllConfig } from '@synapse/core';
import { seedDemoProviders } from './seed/demo-providers.js';

const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3002',
  'https://synapse-web-gold.vercel.app',
  'https://synapse-web.vercel.app',
  process.env.WEB_URL,
  process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined,
].filter(Boolean) as string[];

async function main() {
  // Validate environment configuration at startup
  validateAllConfig();

  // Create Express app
  const app = express();
  const httpServer = createServer(app);

  // Create Socket.IO server
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: ALLOWED_ORIGINS,
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Middleware
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }));
  app.use(cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (ALLOWED_ORIGINS.indexOf(origin) === -1) {
        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
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

  // Initialize LLM Engine with API keys from environment
  const llmEngine = getLLMExecutionEngine({
    openaiApiKey: process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    googleApiKey: process.env.GOOGLE_API_KEY,
    togetherApiKey: process.env.TOGETHER_API_KEY,
    groqApiKey: process.env.GROQ_API_KEY,
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
  });

  console.log('✅ LLM Engine initialized with', llmEngine.getAvailableModels().length, 'available models');

  // Initialize Credit Scorer with persistence
  const creditScorer = getAgentCreditScorer({
    enablePersistence: process.env.CREDIT_PERSISTENCE !== 'false',
    persistencePath: process.env.CREDIT_DB_PATH || './data/credit-scores.json',
    autoSaveInterval: 30000, // 30 seconds
  });
  await creditScorer.initialize();
  console.log('✅ Credit Scorer initialized with persistence');

  // Setup routes
  setupIntentRoutes(app, intentEngine, io);
  setupProviderRoutes(app, providerRegistry, io);
  setupPaymentRoutes(app, intentEngine);
  setupDecompositionRoutes(app, io);
  setupAgentRoutes(app, io);
  setupEscrowRoutes(app, io);
  setupDisputeRoutes(app, io);
  setupWalletRoutes(app);
  app.use('/api/llm', llmRoutes);
  await setupMCPRoutes(app, io);
  setupFlowRoutes(app, io);
  setupPaymentVerificationRoutes(app);

  // Setup WebSocket handlers
  setupWebSocket(io, intentEngine, providerRegistry);

  // Setup engine event broadcasting
  setupEngineEvents(intentEngine, providerRegistry, io);

  // Seed demo providers for testing (disable with SKIP_DEMO_PROVIDERS=true)
  if (process.env.SKIP_DEMO_PROVIDERS === 'true') {
    console.log('⏭️  Skipping demo provider seeding (SKIP_DEMO_PROVIDERS=true)');
  } else {
    seedDemoProviders(providerRegistry);
  }

  // Wallet configuration warnings
  if (!process.env.EIGENCLOUD_PRIVATE_KEY) {
    console.warn('⚠️  EIGENCLOUD_PRIVATE_KEY not set - real USDC payments will fail');
    console.warn('   Set EIGENCLOUD_PRIVATE_KEY in .env for production mode');
  } else {
    console.log('✅ EigenCloud wallet configured for real USDC payments');
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
║   🆕 LLM Comparison & Agent Economy:                               ║
║   • POST /api/llm/compare          - Multi-model comparison        ║
║   • GET  /api/llm/models           - List available models         ║
║   • GET  /api/llm/credit/:agentId  - Get credit profile            ║
║   • POST /api/llm/stream/create    - Create streaming payment      ║
║                                                                    ║
║   🔌 MCP Bilateral Value Exchange:                                 ║
║   • POST /api/mcp/identity/create  - Create MCP wallet identity    ║
║   • POST /api/mcp/intent/create    - Create tool intent            ║
║   • POST /api/mcp/bilateral/create - Create bilateral session      ║
║   • POST /api/mcp/bilateral/:id/settle - Settle session            ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
    `);
  });
}

main().catch(console.error);
