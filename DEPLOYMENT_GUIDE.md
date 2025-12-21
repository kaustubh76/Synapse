# SYNAPSE: Complete Deployment Guide
## End-to-End On-Chain Testing with x402 Payments

**Last Updated:** December 2025
**Network:** Base Sepolia (Testnet)
**Protocol:** x402 HTTP-Native Payments

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Prerequisites](#2-prerequisites)
3. [Environment Configuration](#3-environment-configuration)
4. [Local Development Setup](#4-local-development-setup)
5. [Testnet Wallet Setup](#5-testnet-wallet-setup)
6. [Running the Full Stack](#6-running-the-full-stack)
7. [Testing x402 Payments](#7-testing-x402-payments)
8. [Production Deployment](#8-production-deployment)
9. [Docker Deployment](#9-docker-deployment)
10. [Vercel Deployment (Frontend)](#10-vercel-deployment-frontend)
11. [Troubleshooting](#11-troubleshooting)
12. [Architecture Reference](#12-architecture-reference)

---

## 1. Quick Start

```bash
# Clone and install
git clone <repository-url>
cd Synapse
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys (see Section 3)

# Build all packages
npm run build

# Start everything (API + Web + Providers)
npm run dev:all
```

**Default URLs:**
- API: http://localhost:3001
- Web Dashboard: http://localhost:3000
- MCP Gateway: http://localhost:3002
- Weather Bot: http://localhost:3010
- Crypto Bot: http://localhost:3020
- News Bot: http://localhost:3030

---

## 2. Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 18.0.0+ | Runtime |
| npm | 10.2.0+ | Package manager |
| Git | 2.0+ | Version control |

### Required Accounts (for Production)

| Service | Purpose | Sign Up URL |
|---------|---------|-------------|
| Crossmint | Smart Wallets | https://crossmint.com |
| Thirdweb | x402 Facilitator | https://thirdweb.com |
| Alchemy/Infura | RPC Provider | https://alchemy.com |

### Testnet Requirements

| Item | Details |
|------|---------|
| Network | Base Sepolia (Chain ID: 84532) |
| Native Token | ETH (for gas) |
| Payment Token | USDC (for x402 payments) |
| USDC Address | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

---

## 3. Environment Configuration

### 3.1 Root Environment File (`.env`)

Create `.env` in the project root:

```bash
# ============================================================
# SYNAPSE ENVIRONMENT CONFIGURATION
# ============================================================

# ------------------------------------------------------------
# CORE SETTINGS
# ------------------------------------------------------------
NODE_ENV=development
API_PORT=3001
WEB_PORT=3000
MCP_GATEWAY_PORT=3002
CORS_ORIGIN=http://localhost:3000

# ------------------------------------------------------------
# x402 PAYMENT CONFIGURATION
# ------------------------------------------------------------
# Demo Mode: Set to 'false' for real blockchain payments
X402_DEMO_MODE=true

# Network: 'base-sepolia' for testnet, 'base' for mainnet
X402_NETWORK=base-sepolia

# Thirdweb Secret Key (required for production x402)
# Get from: https://thirdweb.com/dashboard/settings/api-keys
THIRDWEB_SECRET_KEY=

# Server wallet address (receives provider payments)
X402_SERVER_WALLET=

# ------------------------------------------------------------
# CROSSMINT WALLET CONFIGURATION
# ------------------------------------------------------------
# Get from: https://www.crossmint.com/console
CROSSMINT_API_KEY=
CROSSMINT_PROJECT_ID=
CROSSMINT_ENVIRONMENT=staging

# ------------------------------------------------------------
# BLOCKCHAIN RPC
# ------------------------------------------------------------
# Base Sepolia RPC (free tier available)
BASE_RPC_URL=https://sepolia.base.org

# Alternative: Alchemy RPC
# BASE_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY

# ------------------------------------------------------------
# EIGENCLOUD INTEGRATION (Optional)
# ------------------------------------------------------------
EIGENCLOUD_API_KEY=
EIGENCLOUD_PROJECT_ID=
EIGENCLOUD_DEMO_MODE=true
EIGENCOMPUTE_API_URL=https://api.eigencloud.xyz
TEE_VERIFIER_URL=https://verify.eigencloud.xyz
ZK_VERIFIER_URL=https://verify.eigencloud.xyz

# ------------------------------------------------------------
# ERC-8004 REGISTRY (Optional)
# ------------------------------------------------------------
ERC8004_RPC_URL=https://sepolia.base.org
ERC8004_REGISTRY_ADDRESS=0x0000000000000000000000000000000000008004
ERC8004_CHAIN_ID=84532
ERC8004_DEMO_MODE=true

# ------------------------------------------------------------
# EXTERNAL DATA APIS (Optional - for provider bots)
# ------------------------------------------------------------
OPENWEATHERMAP_API_KEY=
COINGECKO_API_KEY=
NEWS_API_KEY=

# ------------------------------------------------------------
# DEMO SETTINGS
# ------------------------------------------------------------
SKIP_DEMO_PROVIDERS=false
```

### 3.2 API Environment (`apps/api/.env`)

```bash
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

# Copy x402 settings from root
X402_DEMO_MODE=true
X402_NETWORK=base-sepolia
THIRDWEB_SECRET_KEY=
X402_SERVER_WALLET=

# Crossmint
CROSSMINT_API_KEY=
```

### 3.3 Web Environment (`apps/web/.env.local`)

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001
```

---

## 4. Local Development Setup

### 4.1 Install Dependencies

```bash
cd Synapse
npm install
```

### 4.2 Build All Packages

```bash
npm run build
```

**Build Order (handled by Turborepo):**
1. `@synapse/types` - Shared TypeScript types
2. `@synapse/core` - Core business logic + x402
3. `@synapse/sdk` - Client SDK + Crossmint
4. `@synapse/mcp-gateway` - MCP protocol gateway
5. `@synapse/api` - Express backend
6. `@synapse/web` - Next.js frontend
7. Provider bots (weather, crypto, news)

### 4.3 Verify Build

```bash
# Check build outputs exist
ls -la apps/api/dist/
ls -la apps/web/.next/
ls -la packages/core/dist/
```

---

## 5. Testnet Wallet Setup

### 5.1 Create a Test Wallet

Use MetaMask or any Web3 wallet:
1. Create a new wallet or use existing
2. Add Base Sepolia network:
   - Network Name: Base Sepolia
   - RPC URL: https://sepolia.base.org
   - Chain ID: 84532
   - Currency Symbol: ETH
   - Block Explorer: https://sepolia.basescan.org

### 5.2 Get Testnet ETH

Base Sepolia faucets:
- https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
- https://www.alchemy.com/faucets/base-sepolia

### 5.3 Get Testnet USDC

Base Sepolia USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

Options:
1. **Swap testnet ETH for USDC** on Uniswap Base Sepolia
2. **Use Circle Faucet** (if available)
3. **Contact Base Discord** for testnet tokens

### 5.4 Configure Provider Wallet

Each provider bot needs a wallet address to receive payments:

```bash
# In each provider's environment or root .env
PROVIDER_ADDRESS=0xYourProviderWalletAddress
```

---

## 6. Running the Full Stack

### 6.1 Start Everything (Recommended)

```bash
# Terminal 1: Start all services
npm run dev:all
```

This starts:
- API server (port 3001)
- Web dashboard (port 3000)
- Weather bot (port 3010)
- Crypto bot (port 3020)
- News bot (port 3030)

### 6.2 Start Services Individually

```bash
# Terminal 1: API Server
npm run dev:api

# Terminal 2: Web Dashboard
npm run dev:web

# Terminal 3: Weather Provider
npm run dev --workspace=providers/weather-bot

# Terminal 4: Crypto Provider
npm run dev --workspace=providers/crypto-bot

# Terminal 5: News Provider
npm run dev --workspace=providers/news-bot
```

### 6.3 Start MCP Gateway (Optional)

```bash
npm run dev --workspace=packages/mcp-gateway
```

### 6.4 Verify Services

```bash
# Check API health
curl http://localhost:3001/health

# Check provider health
curl http://localhost:3010/health  # Weather
curl http://localhost:3020/health  # Crypto
curl http://localhost:3030/health  # News
```

---

## 7. Testing x402 Payments

### 7.1 Demo Mode Testing (No Real Blockchain)

With `X402_DEMO_MODE=true`, payments are simulated:

```bash
# Create an intent via API
curl -X POST http://localhost:3001/api/intents \
  -H "Content-Type: application/json" \
  -d '{
    "type": "weather.current",
    "params": {"city": "New York"},
    "maxBudget": 0.01
  }'

# Response includes simulated payment
```

### 7.2 Real Blockchain Testing

1. **Set environment variables:**
   ```bash
   X402_DEMO_MODE=false
   THIRDWEB_SECRET_KEY=your_thirdweb_key
   X402_SERVER_WALLET=0xYourServerWallet
   ```

2. **Restart services:**
   ```bash
   npm run dev:all
   ```

3. **Test direct provider API with x402:**
   ```bash
   # First request - will return 402 Payment Required
   curl http://localhost:3010/api/weather?city=NYC

   # Response:
   # {
   #   "error": "Payment Required",
   #   "code": "PAYMENT_REQUIRED",
   #   "x402": {
   #     "scheme": "exact",
   #     "network": "base-sepolia",
   #     "token": "USDC",
   #     "amount": "5000",
   #     "recipient": "0x..."
   #   }
   # }
   ```

4. **Make payment and retry:**
   ```bash
   # With valid X-Payment header containing signed payment proof
   curl http://localhost:3010/api/weather?city=NYC \
     -H "X-Payment: <base64-encoded-payment-payload>"
   ```

### 7.3 Full Intent Flow Test

```bash
# 1. Create intent
INTENT_ID=$(curl -s -X POST http://localhost:3001/api/intents \
  -H "Content-Type: application/json" \
  -d '{
    "type": "crypto.price",
    "params": {"symbol": "ETH"},
    "maxBudget": 0.005
  }' | jq -r '.data.id')

echo "Created intent: $INTENT_ID"

# 2. Watch for bids and completion via WebSocket
# Use the web dashboard at http://localhost:3000 to see real-time updates

# 3. Check intent status
curl http://localhost:3001/api/intents/$INTENT_ID
```

---

## 8. Production Deployment

### 8.1 Pre-Deployment Checklist

- [ ] All API keys configured
- [ ] `X402_DEMO_MODE=false`
- [ ] `NODE_ENV=production`
- [ ] Server wallet funded with ETH (for gas)
- [ ] CORS origins configured
- [ ] SSL/TLS certificates ready
- [ ] Database configured (if using persistence)
- [ ] Rate limiting configured
- [ ] Monitoring setup

### 8.2 Build for Production

```bash
# Clean and rebuild
rm -rf node_modules
npm install
npm run build
```

### 8.3 Production Start Commands

```bash
# API Server
cd apps/api
NODE_ENV=production PORT=3001 node dist/index.js

# Web Dashboard (Next.js)
cd apps/web
npm run build
npm start

# Provider Bots
cd providers/weather-bot
NODE_ENV=production PORT=3010 node dist/index.js
```

### 8.4 Process Manager (PM2)

```bash
# Install PM2
npm install -g pm2

# Create ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'synapse-api',
      cwd: './apps/api',
      script: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    },
    {
      name: 'synapse-weather',
      cwd: './providers/weather-bot',
      script: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3010
      }
    },
    {
      name: 'synapse-crypto',
      cwd: './providers/crypto-bot',
      script: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3020
      }
    },
    {
      name: 'synapse-news',
      cwd: './providers/news-bot',
      script: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3030
      }
    }
  ]
};
EOF

# Start all services
pm2 start ecosystem.config.js

# Save process list
pm2 save

# Setup startup script
pm2 startup
```

---

## 9. Docker Deployment

### 9.1 Create Dockerfile for API

Create `apps/api/Dockerfile`:

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/core/package*.json ./packages/core/
COPY packages/types/package*.json ./packages/types/

# Install dependencies
RUN npm ci

# Copy source
COPY . .

# Build
RUN npm run build --workspace=@synapse/types
RUN npm run build --workspace=@synapse/core
RUN npm run build --workspace=@synapse/api

# Production image
FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/index.js"]
```

### 9.2 Create Dockerfile for Web

Create `apps/web/Dockerfile`:

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
COPY packages/types/package*.json ./packages/types/

RUN npm ci

COPY . .

RUN npm run build --workspace=@synapse/types
RUN npm run build --workspace=@synapse/web

FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/apps/web/.next ./.next
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/package.json ./
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
```

### 9.3 Create docker-compose.yml

Create `docker-compose.yml` in project root:

```yaml
version: '3.8'

services:
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
      - CORS_ORIGIN=http://localhost:3000
      - X402_DEMO_MODE=${X402_DEMO_MODE:-true}
      - X402_NETWORK=${X402_NETWORK:-base-sepolia}
      - THIRDWEB_SECRET_KEY=${THIRDWEB_SECRET_KEY}
      - X402_SERVER_WALLET=${X402_SERVER_WALLET}
      - CROSSMINT_API_KEY=${CROSSMINT_API_KEY}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://api:3001
    depends_on:
      - api

  weather-bot:
    build:
      context: .
      dockerfile: providers/weather-bot/Dockerfile
    ports:
      - "3010:3010"
    environment:
      - NODE_ENV=production
      - PORT=3010
      - SYNAPSE_API_URL=http://api:3001
      - X402_DEMO_MODE=${X402_DEMO_MODE:-true}
      - X402_NETWORK=${X402_NETWORK:-base-sepolia}
    depends_on:
      - api

  crypto-bot:
    build:
      context: .
      dockerfile: providers/crypto-bot/Dockerfile
    ports:
      - "3020:3020"
    environment:
      - NODE_ENV=production
      - PORT=3020
      - SYNAPSE_API_URL=http://api:3001
      - X402_DEMO_MODE=${X402_DEMO_MODE:-true}
      - X402_NETWORK=${X402_NETWORK:-base-sepolia}
    depends_on:
      - api

  news-bot:
    build:
      context: .
      dockerfile: providers/news-bot/Dockerfile
    ports:
      - "3030:3030"
    environment:
      - NODE_ENV=production
      - PORT=3030
      - SYNAPSE_API_URL=http://api:3001
      - X402_DEMO_MODE=${X402_DEMO_MODE:-true}
      - X402_NETWORK=${X402_NETWORK:-base-sepolia}
    depends_on:
      - api
```

### 9.4 Run with Docker Compose

```bash
# Build and start all services
docker-compose up --build

# Run in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

---

## 10. Vercel Deployment (Frontend)

### 10.1 Create vercel.json

Create `apps/web/vercel.json`:

```json
{
  "buildCommand": "cd ../.. && npm run build --workspace=@synapse/web",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "regions": ["iad1"],
  "env": {
    "NEXT_PUBLIC_API_URL": "@synapse_api_url"
  }
}
```

### 10.2 Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy from web directory
cd apps/web
vercel

# Set environment variables
vercel env add NEXT_PUBLIC_API_URL
# Enter your production API URL
```

### 10.3 Configure Custom Domain

1. Go to Vercel Dashboard
2. Select your project
3. Go to Settings > Domains
4. Add your custom domain

---

## 11. Troubleshooting

### Common Issues

#### 1. "Module not found" errors

```bash
# Clean and reinstall
rm -rf node_modules
rm -rf apps/*/node_modules
rm -rf packages/*/node_modules
rm -rf providers/*/node_modules
npm install
npm run build
```

#### 2. Port already in use

```bash
# Find and kill process
lsof -ti:3001 | xargs kill -9
```

#### 3. WebSocket connection failed

Check CORS configuration:
```bash
# In .env
CORS_ORIGIN=http://localhost:3000
```

#### 4. x402 Payment verification failed

- Check `X402_DEMO_MODE` setting
- Verify `THIRDWEB_SECRET_KEY` is valid
- Ensure wallet has sufficient USDC balance

#### 5. Provider not receiving intents

- Verify WebSocket connection is established
- Check provider is registered with correct capabilities
- Ensure provider is listening for correct intent types

### Debug Mode

Enable verbose logging:
```bash
DEBUG=synapse:* npm run dev:api
```

### Health Check Endpoints

```bash
# API
curl http://localhost:3001/health

# Providers
curl http://localhost:3010/health  # Weather
curl http://localhost:3020/health  # Crypto
curl http://localhost:3030/health  # News
```

---

## 12. Architecture Reference

### Service Ports

| Service | Port | Protocol |
|---------|------|----------|
| API | 3001 | HTTP/WS |
| Web | 3000 | HTTP |
| MCP Gateway | 3002 | HTTP/SSE |
| Weather Bot | 3010 | HTTP |
| Crypto Bot | 3020 | HTTP |
| News Bot | 3030 | HTTP |

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/intents` | POST | Create intent |
| `/api/intents` | GET | List intents |
| `/api/intents/:id` | GET | Get intent details |
| `/api/intents/:id/bid` | POST | Submit bid |
| `/api/intents/:id/result` | POST | Submit result |
| `/api/providers` | POST | Register provider |
| `/api/providers` | GET | List providers |

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `new-intent-available` | Server→Client | New intent for bidding |
| `bid-received` | Server→Client | New bid on intent |
| `winner-selected` | Server→Client | Winner announced |
| `intent-assigned` | Server→Client | Intent assigned to provider |
| `intent-completed` | Server→Client | Intent fulfilled |
| `payment-settled` | Server→Client | Payment confirmed |

### x402 Payment Flow

```
┌─────────┐     ┌─────────┐     ┌──────────┐     ┌───────────┐
│  Client │────>│   API   │────>│ Provider │────>│Facilitator│
└─────────┘     └─────────┘     └──────────┘     └───────────┘
     │               │               │                 │
     │ 1. Create     │               │                 │
     │    Intent     │               │                 │
     │──────────────>│               │                 │
     │               │ 2. Broadcast  │                 │
     │               │    to         │                 │
     │               │    Providers  │                 │
     │               │──────────────>│                 │
     │               │               │ 3. Submit Bid   │
     │               │<──────────────│                 │
     │               │               │                 │
     │               │ 4. Select     │                 │
     │               │    Winner     │                 │
     │               │──────────────>│                 │
     │               │               │ 5. Execute      │
     │               │               │    Intent       │
     │               │<──────────────│                 │
     │               │               │                 │
     │               │ 6. Verify Payment               │
     │               │────────────────────────────────>│
     │               │                                 │
     │               │ 7. Settlement on Base Sepolia   │
     │               │<────────────────────────────────│
     │               │               │                 │
     │ 8. Result     │               │                 │
     │<──────────────│               │                 │
     │               │               │                 │
```

---

## Summary

This guide covers the complete deployment process for Synapse with real x402 payments on Base Sepolia. Key steps:

1. **Configure environment** with API keys and wallet addresses
2. **Get testnet tokens** (ETH for gas, USDC for payments)
3. **Run services** locally or via Docker
4. **Test payment flow** in demo mode first, then production
5. **Deploy to production** using PM2, Docker, or cloud platforms

For support, check the project's GitHub issues or documentation.

---

*Generated for Synapse x402 Hackathon - December 2025*
