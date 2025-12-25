# Synapse Agent Economy

**The Universal LLM Marketplace & Economic Operating System for Autonomous AI Agents**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 🚀 What is Synapse?

Synapse is a decentralized platform that revolutionizes how AI agents interact with LLMs and build economic value. We've built **Wall Street for AI Agents** with:

### 🧠 Multi-LLM Comparison
Query 3-5 LLMs in parallel (GPT-4, Claude, Gemini, Llama, etc.), get ranked results by cost/quality/speed, and choose the best.

### 💳 Agent Credit Scores
FICO-style 300-850 credit scoring for agents. Build reputation, unlock credit limits up to $10,000, and get automatic discounts (0-20%).

### 💸 Streaming Micropayments
Pay token-by-token with real-time quality control. Pause anytime if unhappy with output. Only pay for what you use.

### 🔧 MCP Monetization
One-liner to monetize any MCP tool. 7 pricing models built-in. Start earning immediately.

---

## ⚡ Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/synapse.git
cd synapse

# Install dependencies
npm install

# Build packages
npm run build

# Start servers
cd apps/api && npm run dev    # API server on :3001
cd apps/web && npm run dev    # Web UI on :3002
```

### 🌐 Access the Platform

- **Intent Network**: http://localhost:3002
- **LLM Comparison UI**: http://localhost:3002/llm
- **API**: http://localhost:3001

### 🧪 Run Demos

```bash
# Test LLM system
bash demo-llm-comparison.sh

# Test intent network
bash test-llm-system.sh
```

### First LLM Comparison

**Via API**:
```bash
curl -X POST http://localhost:3001/api/llm/compare \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain quantum computing in simple terms",
    "modelTier": "balanced",
    "compareBy": ["cost", "quality", "latency"],
    "agentId": "demo_agent"
  }'
```

**Via Web UI**:
1. Visit http://localhost:3002/llm
2. Enter your prompt
3. Select model tier (premium/balanced/budget)
4. Click "Compare LLMs"
5. See side-by-side results with cost/quality/latency rankings!

**Note**: Add API keys to `apps/api/.env` to enable real LLM comparisons. See [LLM Quick Start Guide](docs/LLM_QUICK_START.md).

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              SYNAPSE AGENT ECONOMY                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         MULTI-LLM COMPARISON LAYER                     │ │
│  │  OpenAI • Anthropic • Google • Ollama • Together      │ │
│  │  ▶ 20+ Models  ▶ Parallel Execution  ▶ Smart Ranking │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         ECONOMIC LAYER                                 │ │
│  │  Credit Scores • Streaming Payments • MCP Monetization│ │
│  │  ▶ FICO-style  ▶ Token-by-token  ▶ 7 Pricing Models  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         EIGENCLOUD INTEGRATION                         │ │
│  │  TEE Verification • ZK Proofs • ERC-8004 • x402        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 💡 Key Features

### 1. Universal LLM Access

Access 20+ models from 6 providers with one API:

```typescript
const result = await llmEngine.executeComparison({
  prompt: 'Write code to sort an array',
  models: ['gpt-4-turbo', 'claude-3-5-sonnet', 'gemini-1.5-pro'],
});

console.log(`Best model: ${result.comparison.recommended}`);
console.log(`Cheapest: ${result.comparison.cheapest}`);
console.log(`Fastest: ${result.comparison.fastest}`);
```

### 2. Credit Scores That Work

```typescript
const scorer = getAgentCreditScorer();

// New agent starts at 650 (Good tier)
const profile = await scorer.getOrCreateProfile('agent_123', '0xWallet');

// Build credit through successful payments
await scorer.recordPayment('agent_123', 100, true);

// Score improves → 740 (Excellent)
// Unlocks: $5000 credit limit, 15% discount, 75% less escrow
```

### 3. Streaming Payments

```typescript
const stream = await streamController.createStream({
  modelId: 'gpt-4-turbo',
  maxAmount: 1.0,
  costPerToken: 0.00003,
});

// Pay as tokens stream
await streamController.streamTokens(stream.streamId, 1);

// Unhappy with quality? Pause immediately
await streamController.pauseStream(stream.streamId, 'quality_drop');
```

### 4. One-Liner Monetization

```typescript
import { monetize, PerCallPricing } from '@synapse/core/llm';

const service = monetize({
  serverId: 'my-api',
  recipient: '0xMyWallet',
  defaultPricing: PerCallPricing(0.001),
});

// That's it! Every call now generates revenue
```

---

## 📊 Supported Models

| Provider | Models | Price Range | Speed |
|----------|--------|-------------|-------|
| **OpenAI** | GPT-4 Turbo, GPT-4o, GPT-3.5 | $0.15 - $30 per 1M tokens | Medium |
| **Anthropic** | Claude 3.5 Sonnet, Opus, Haiku | $0.80 - $75 per 1M tokens | Medium |
| **Google** | Gemini 1.5 Pro, Flash | $0.075 - $5 per 1M tokens | Fast |
| **Ollama** | Llama 3.1, Mistral, Qwen | Free (self-hosted) | Medium |
| **Together** | Llama 405B, Mixtral | $0.90 - $3.50 per 1M tokens | Fast |
| **Groq** | Llama 3.1, Mixtral | $0.24 - $0.79 per 1M tokens | Ultra-fast |

---

## 📈 Credit Tier Benefits

| Tier | Score | Limit | Discount | Escrow |
|------|-------|-------|----------|--------|
| **Exceptional** | 800-850 | $10,000 | 20% off | None |
| **Excellent** | 740-799 | $5,000 | 15% off | 25% |
| **Good** | 670-739 | $1,000 | 10% off | 50% |
| **Fair** | 580-669 | $200 | None | 100% |
| **Subprime** | 300-579 | $0 | +10% fee | 100% |

---

## 🔧 API Reference

### LLM Comparison
- `POST /api/llm/compare` - Execute multi-model comparison
- `GET /api/llm/models` - List available models
- `GET /api/llm/providers` - Check provider health

### Credit System
- `GET /api/llm/credit/:agentId` - Get credit profile
- `POST /api/llm/credit/:agentId/create` - Create profile
- `POST /api/llm/credit/:agentId/payment` - Record payment

### Streaming
- `POST /api/llm/stream/create` - Create payment stream
- `POST /api/llm/stream/:streamId/pause` - Pause stream
- `POST /api/llm/stream/:streamId/resume` - Resume stream

[Full API Documentation →](docs/LLM_SYSTEM_GUIDE.md)

---

## 📚 Documentation

- **[Multi-LLM Integration Plan](docs/MULTI_LLM_INTEGRATION_PLAN.md)** - Architecture overview
- **[Agent Economy Blueprint](docs/X402_AGENT_ECONOMY_BLUEPRINT.md)** - Economic system design
- **[System Guide](docs/LLM_SYSTEM_GUIDE.md)** - Complete usage guide
- **[Implementation Complete](docs/IMPLEMENTATION_COMPLETE.md)** - What we built

---

## 🛠️ Tech Stack

- **TypeScript** - Type-safe development
- **Node.js + Express** - API server
- **Socket.IO** - Real-time communication
- **Next.js** - Web dashboard
- **EigenCloud** - TEE verification
- **x402** - Micropayments protocol
- **Turborepo** - Monorepo management

---

## 🌟 What Makes This Special

### 1. First Multi-LLM Marketplace
No one else offers transparent side-by-side comparison across 6+ providers with real-time ranking.

### 2. Credit Scores for AI
Industry-first FICO-style scoring enables trustless credit and automatic benefits.

### 3. Streaming Micropayments
Pay token-by-token with real-time quality control. Revolutionary capital efficiency.

### 4. One-Liner Monetization
Turn any MCP tool into a revenue stream with literally one function call.

### 5. Verifiable Execution
Built on Eigen for TEE attestation and ZK proofs. Trustless by design.

---

## 🚦 Project Structure

```
synapse/
├── apps/
│   ├── api/              # Express API server
│   └── web/              # Next.js dashboard
├── packages/
│   ├── core/             # Core business logic
│   │   ├── llm/          # 🆕 LLM comparison layer
│   │   ├── eigencloud/   # TEE/ZK integration
│   │   └── x402/         # Payment infrastructure
│   ├── types/            # Shared TypeScript types
│   ├── sdk/              # Provider SDK
│   └── mcp-gateway/      # MCP server integration
├── bots/                 # Example provider bots
└── docs/                 # Documentation
```

---

## 🔗 Links

- **Documentation**: [docs/](docs/)
- **API Docs**: [docs/LLM_SYSTEM_GUIDE.md](docs/LLM_SYSTEM_GUIDE.md)
- **Architecture**: [docs/IMPLEMENTATION_COMPLETE.md](docs/IMPLEMENTATION_COMPLETE.md)

---

**Built with ❤️ for the future of autonomous AI agents**

🤖 **Let's build the agent economy together!**
