# ============================================================
# SYNAPSE - Multi-stage Production Dockerfile
# ============================================================

# Stage 1: Builder
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY turbo.json ./
# Core packages
COPY packages/types/package*.json ./packages/types/
COPY packages/core/package*.json ./packages/core/
COPY packages/sdk/package*.json ./packages/sdk/
COPY packages/mcp-gateway/package*.json ./packages/mcp-gateway/
# Apps
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/
# Providers
COPY providers/weather-bot/package*.json ./providers/weather-bot/
COPY providers/crypto-bot/package*.json ./providers/crypto-bot/
COPY providers/news-bot/package*.json ./providers/news-bot/

RUN npm ci

# Copy source code
COPY . .

# Build all packages
RUN npm run build

# Stage 2: API Runtime
FROM node:18-alpine AS api

WORKDIR /app

# Copy built packages
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types ./packages/types
COPY --from=builder /app/packages/core ./packages/core
COPY --from=builder /app/packages/sdk ./packages/sdk
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/package*.json ./

EXPOSE 3001

CMD ["node", "apps/api/dist/index.js"]

# Stage 3: Web Runtime
FROM node:18-alpine AS web

WORKDIR /app

# Copy built web app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web ./apps/web
COPY --from=builder /app/package*.json ./

EXPOSE 3000

CMD ["npm", "run", "--prefix", "apps/web", "start"]

# Stage 4: MCP Gateway Runtime
FROM node:18-alpine AS mcp-gateway

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types ./packages/types
COPY --from=builder /app/packages/core ./packages/core
COPY --from=builder /app/packages/sdk ./packages/sdk
COPY --from=builder /app/packages/mcp-gateway ./packages/mcp-gateway
COPY --from=builder /app/package*.json ./

EXPOSE 3002

CMD ["node", "packages/mcp-gateway/dist/server.js"]

# Stage 5: Weather Bot Runtime
FROM node:18-alpine AS weather-bot

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types ./packages/types
COPY --from=builder /app/packages/core ./packages/core
COPY --from=builder /app/providers/weather-bot ./providers/weather-bot
COPY --from=builder /app/package*.json ./

EXPOSE 3010

CMD ["node", "providers/weather-bot/dist/index.js"]

# Stage 6: Crypto Bot Runtime
FROM node:18-alpine AS crypto-bot

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types ./packages/types
COPY --from=builder /app/packages/core ./packages/core
COPY --from=builder /app/providers/crypto-bot ./providers/crypto-bot
COPY --from=builder /app/package*.json ./

EXPOSE 3020

CMD ["node", "providers/crypto-bot/dist/index.js"]

# Stage 7: News Bot Runtime
FROM node:18-alpine AS news-bot

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types ./packages/types
COPY --from=builder /app/packages/core ./packages/core
COPY --from=builder /app/providers/news-bot ./providers/news-bot
COPY --from=builder /app/package*.json ./

EXPOSE 3030

CMD ["node", "providers/news-bot/dist/index.js"]
