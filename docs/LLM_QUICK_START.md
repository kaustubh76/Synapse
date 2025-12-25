# 🧠 Synapse LLM System - Quick Start Guide

## 🎯 What You've Built

A revolutionary **Multi-LLM Comparison & Agent Economy Platform** with:

1. **Multi-LLM Marketplace** - Query 20+ models across 6 providers in parallel
2. **Agent Credit Scores** - FICO-style 300-850 scoring with automatic discounts
3. **Streaming Micropayments** - Pay token-by-token with real-time quality control
4. **MCP Monetization** - One-liner tool monetization with 7 pricing models

---

## 🚀 Running the System

### Current Status

✅ **API Server**: Running at http://localhost:3001
✅ **Web UI**: Running at http://localhost:3002
✅ **Intent Network**: http://localhost:3002
✅ **LLM Comparison**: http://localhost:3002/llm

### Quick Test

```bash
# Test the system
bash demo-llm-comparison.sh

# Or test individual endpoints
bash test-llm-system.sh
```

---

## 🌐 Access Points

### 1. Intent Network (Main UI)
**URL**: http://localhost:3002

Features:
- Create intents (weather, crypto, news)
- Watch providers bid in real-time
- See winner selection and execution
- View network statistics

### 2. LLM Comparison UI
**URL**: http://localhost:3002/llm

Features:
- Compare multiple LLMs side-by-side
- See cost, quality, and latency rankings
- View your agent credit score
- Get automatic discounts based on credit tier

### 3. API Endpoints
**Base URL**: http://localhost:3001/api/llm

Key endpoints:
- `POST /compare` - Compare multiple LLMs
- `GET /models` - List available models
- `GET /credit/:agentId` - Get credit profile
- `POST /credit/:agentId/create` - Create credit profile
- `POST /stream/create` - Create streaming payment

---

## 📊 What's Working Now

### ✅ Fully Functional (No API Keys Needed)

1. **Credit Score System**
   - Create agent profiles
   - 300-850 FICO-style scoring
   - 5 credit tiers with different benefits
   - Automatic discount calculation

2. **Intent Network**
   - Create intents
   - Provider bidding
   - Winner selection
   - Payment settlement

3. **API Infrastructure**
   - All endpoints operational
   - WebSocket real-time updates
   - Error handling
   - Validation

### ⏳ Needs API Keys to Enable

1. **LLM Comparison**
   - Currently returns "No models available"
   - Add API keys to enable real comparisons
   - See setup instructions below

---

## 🔑 Enabling Real LLM Comparisons

### Step 1: Get API Keys

You need at least one API key from:

- **OpenAI**: https://platform.openai.com/api-keys
- **Anthropic**: https://console.anthropic.com/
- **Google AI**: https://makersuite.google.com/app/apikey
- **Together AI**: https://api.together.xyz/settings/api-keys
- **Groq**: https://console.groq.com/keys

### Step 2: Add Keys to Environment

Edit `apps/api/.env`:

```bash
# LLM Provider API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
TOGETHER_API_KEY=...
GROQ_API_KEY=gsk_...

# Optional: Local Ollama
OLLAMA_BASE_URL=http://localhost:11434
```

### Step 3: Restart API Server

```bash
cd apps/api
npm run dev
```

### Step 4: Test It

```bash
# Test comparison
curl -X POST http://localhost:3001/api/llm/compare \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain quantum computing in simple terms",
    "modelTier": "balanced",
    "compareBy": ["cost", "quality", "latency"],
    "agentId": "demo_agent"
  }' | jq '.'
```

Or visit http://localhost:3002/llm and use the visual UI!

---

## 💡 Example Use Cases

### 1. Cost Optimization

```bash
# Compare models to find cheapest option
curl -X POST http://localhost:3001/api/llm/compare \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write a product description",
    "modelTier": "budget",
    "compareBy": ["cost"]
  }'
```

### 2. Quality-First

```bash
# Get best quality responses
curl -X POST http://localhost:3001/api/llm/compare \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write a technical whitepaper",
    "modelTier": "premium",
    "compareBy": ["quality"]
  }'
```

### 3. Speed-Critical

```bash
# Fastest responses
curl -X POST http://localhost:3001/api/llm/compare \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Summarize this text",
    "modelTier": "all",
    "compareBy": ["latency"]
  }'
```

### 4. Build Credit Score

```bash
# Create profile
curl -X POST http://localhost:3001/api/llm/credit/my_agent/create \
  -H "Content-Type: application/json" \
  -d '{"address": "0xYourWallet"}'

# Make successful payments to build score
# Score goes from 650 → 850
# Unlocks up to $10,000 credit + 20% discount
```

---

## 📈 Credit Tier Benefits

| Tier | Score | Limit | Discount | Escrow |
|------|-------|-------|----------|--------|
| **Exceptional** | 800-850 | $10,000 | 20% | None |
| **Excellent** | 740-799 | $5,000 | 15% | 25% |
| **Good** | 670-739 | $1,000 | 10% | 50% |
| **Fair** | 580-669 | $200 | None | 100% |
| **Subprime** | 300-579 | $0 | +10% fee | 100% |

---

## 🎨 Available Model Tiers

### Premium (Best Quality)
- GPT-4 Turbo
- Claude 3.5 Sonnet
- Claude 3 Opus
- Gemini 1.5 Pro

### Balanced (Best Value)
- GPT-4
- Claude 3.5 Sonnet
- Gemini 1.5 Pro
- Llama 3.1 70B

### Budget (Lowest Cost)
- GPT-3.5 Turbo
- Claude 3 Haiku
- Gemini 1.5 Flash
- Llama 3.1 8B

---

## 💸 MCP Monetization Example

Turn any tool into a revenue stream:

```typescript
import { monetize, PerCallPricing } from '@synapse/core/llm'

// One-liner monetization
const service = monetize({
  serverId: 'my-weather-api',
  serverName: 'Weather Pro',
  recipient: '0xYourWallet',
  defaultPricing: PerCallPricing(0.001), // $0.001 per call

  // Optional: Different prices per tool
  toolPricing: {
    'weather.forecast': PerCallPricing(0.002),
    'weather.alerts': PerCallPricing(0.005),
  },

  // Optional: Volume discounts
  volumeDiscounts: [
    { minCalls: 100, discount: 0.10 },  // 10% off after 100 calls
    { minCalls: 1000, discount: 0.20 }, // 20% off after 1000 calls
  ]
})

// Now every tool call generates revenue!
```

---

## 🧪 Testing Checklist

- [ ] API server running on port 3001
- [ ] Web UI running on port 3002
- [ ] Health check: `curl http://localhost:3001/health`
- [ ] Create credit profile works
- [ ] LLM models endpoint returns data
- [ ] Intent creation works
- [ ] Provider bidding works
- [ ] WebSocket connection established
- [ ] LLM comparison UI loads at /llm

---

## 📚 Documentation

- **[Multi-LLM Integration Plan](MULTI_LLM_INTEGRATION_PLAN.md)** - Architecture
- **[X402 Agent Economy Blueprint](X402_AGENT_ECONOMY_BLUEPRINT.md)** - Economic design
- **[LLM System Guide](LLM_SYSTEM_GUIDE.md)** - Complete API reference
- **[Implementation Complete](IMPLEMENTATION_COMPLETE.md)** - What we built

---

## 🐛 Troubleshooting

### Port Already in Use

```bash
# Kill existing process
lsof -ti :3001 | xargs kill -9
lsof -ti :3002 | xargs kill -9

# Restart servers
cd apps/api && npm run dev
cd apps/web && npm run dev
```

### No Models Available

- You need at least one API key configured
- Edit `apps/api/.env` and add keys
- Restart the API server

### WebSocket Not Connecting

- Check that API server is running on 3001
- Check browser console for errors
- Verify CORS is enabled

### Build Errors

```bash
# Rebuild packages
cd packages/core
npm run build

cd ../../apps/api
npm install
```

---

## 🎯 Next Steps

1. **Add API Keys** - Enable real LLM comparisons
2. **Try the UI** - Visit http://localhost:3002/llm
3. **Test Credit System** - Create profile, make payments, watch score improve
4. **Explore Intent Network** - Create weather/crypto/news intents
5. **Monetize Tools** - Use MCP SDK to monetize your own tools

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

---

**Built with ❤️ for the future of autonomous AI agents**

🤖 **Let's build the agent economy together!**
