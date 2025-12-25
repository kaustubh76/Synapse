# Synapse LLM System - Complete Guide

## 🎯 What is This?

The Synapse LLM System transforms the intent network into a **Universal LLM Marketplace** with:

1. **Multi-Model Comparison** - Query 3-5 LLMs in parallel, compare outputs
2. **Streaming Micropayments** - Pay token-by-token with real-time cost control
3. **Agent Credit Scores** - FICO-style credit system (300-850) for agents
4. **MCP Monetization** - One-liner to monetize any MCP tool
5. **Yield-Bearing Wallets** - Agents earn passive income on idle funds

---

## 🚀 Quick Start

### 1. Configure API Keys

```bash
# .env file
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
GROQ_API_KEY=gsk_...
TOGETHER_API_KEY=...
```

### 2. Start the API Server

```bash
cd apps/api
npm install
npm run dev
```

### 3. Make Your First LLM Comparison

```bash
curl -X POST http://localhost:3001/api/llm/compare \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain quantum computing in simple terms",
    "modelTier": "balanced",
    "minModels": 3,
    "maxModels": 5,
    "compareBy": ["cost", "quality", "latency"]
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "intentId": "llm_abc123",
    "prompt": "Explain quantum computing...",
    "results": [
      {
        "rank": 1,
        "modelId": "claude-3-5-sonnet-20241022",
        "response": "...",
        "cost": 0.0182,
        "latencyMs": 1845,
        "scores": {
          "cost": 0.82,
          "latency": 0.91,
          "quality": 0.94,
          "overall": 0.89
        },
        "badges": ["best_value", "recommended"]
      },
      {
        "rank": 2,
        "modelId": "gpt-4-turbo",
        "response": "...",
        "cost": 0.0245,
        "latencyMs": 2104,
        "scores": { "overall": 0.85 }
      },
      {
        "rank": 3,
        "modelId": "gemini-1.5-flash",
        "response": "...",
        "cost": 0.0089,
        "latencyMs": 524,
        "badges": ["cheapest", "fastest"]
      }
    ],
    "totalCost": 0.0516,
    "comparison": {
      "cheapest": "gemini-1.5-flash",
      "fastest": "gemini-1.5-flash",
      "highestQuality": "claude-3-5-sonnet-20241022",
      "recommended": "claude-3-5-sonnet-20241022"
    }
  }
}
```

---

## 📖 API Reference

### LLM Comparison

#### `POST /api/llm/compare`

Compare responses across multiple LLM models.

**Request Body:**

```typescript
{
  prompt: string;              // Required: Your prompt
  systemPrompt?: string;       // Optional: System message
  models?: string[];           // Specific models (e.g., ["gpt-4-turbo", "claude-3-sonnet"])
  modelTier?: 'premium' | 'balanced' | 'budget' | 'all';  // Default: 'balanced'
  minModels?: number;          // Min models to query (default: 3)
  maxModels?: number;          // Max models to query (default: 5)
  maxTokens?: number;          // Max output tokens (default: 1000)
  temperature?: number;        // 0-1 (default: 0.7)
  compareBy?: ('cost' | 'quality' | 'latency')[];  // Comparison criteria
  selectionMode?: 'manual' | 'cheapest' | 'fastest' | 'highest_quality' | 'best_value';
  agentId?: string;            // Optional: For credit tracking
}
```

**Response:**

```typescript
{
  success: boolean;
  data: {
    intentId: string;
    results: RankedLLMResult[];     // Ranked by overall score
    totalCost: number;
    avgLatency: number;
    comparison: {
      cheapest: string;
      fastest: string;
      highestQuality: string;
      recommended: string;
    };
  };
}
```

---

### Available Models

#### `GET /api/llm/models`

List all available models.

**Response:**

```json
{
  "success": true,
  "data": {
    "models": [
      "gpt-4-turbo",
      "gpt-4o",
      "gpt-4o-mini",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
      "llama3.1:70b",
      ...
    ],
    "stats": {
      "totalProviders": 6,
      "availableProviders": 4,
      "totalModels": 20,
      "availableModels": 15
    }
  }
}
```

---

### Credit System

#### `GET /api/llm/credit/:agentId`

Get agent's credit profile.

**Response:**

```json
{
  "success": true,
  "data": {
    "agentId": "agent_123",
    "creditScore": 740,
    "creditTier": "excellent",
    "unsecuredCreditLimit": 5000,
    "availableCredit": 4250,
    "currentBalance": 750,
    "tierDiscount": 0.15,
    "factors": {
      "paymentHistory": 95,
      "creditUtilization": 85,
      "accountAge": 80,
      "creditMix": 70,
      "recentActivity": 90
    }
  }
}
```

#### `POST /api/llm/credit/:agentId/create`

Create credit profile for an agent.

**Request:**

```json
{
  "address": "0x..."
}
```

#### `POST /api/llm/credit/:agentId/payment`

Record a credit payment.

**Request:**

```json
{
  "amount": 100,
  "onTime": true
}
```

---

### Streaming Payments

#### `POST /api/llm/stream/create`

Create a streaming payment for token-by-token billing.

**Request:**

```json
{
  "intentId": "llm_abc123",
  "modelId": "gpt-4-turbo",
  "agentId": "agent_123",
  "address": "0x...",
  "maxBudget": 1.0,
  "costPerToken": 0.00003
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "streamId": "stream_xyz",
    "status": "active",
    "streamedTokens": 0,
    "streamedAmount": 0,
    "maxAmount": 1.0
  }
}
```

#### `POST /api/llm/stream/:streamId/pause`

Pause a stream (e.g., quality drops).

#### `POST /api/llm/stream/:streamId/resume`

Resume a paused stream.

---

## 💡 Usage Examples

### Example 1: Basic Comparison

```javascript
const response = await fetch('http://localhost:3001/api/llm/compare', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Write a haiku about AI',
    modelTier: 'budget',  // Use budget models
    maxModels: 3,
  }),
});

const { data } = await response.json();
console.log(`Cheapest: ${data.comparison.cheapest} - $${data.results.find(r => r.badges.includes('cheapest')).cost}`);
```

### Example 2: Specific Models

```javascript
const response = await fetch('http://localhost:3001/api/llm/compare', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Explain blockchain',
    models: ['gpt-4-turbo', 'claude-3-5-sonnet-20241022', 'gemini-1.5-pro'],
    compareBy: ['quality'],  // Prioritize quality
  }),
});
```

### Example 3: With Credit

```javascript
// First, create credit profile
await fetch('http://localhost:3001/api/llm/credit/agent_123/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ address: '0xYourWallet' }),
});

// Then use credit for LLM calls
const response = await fetch('http://localhost:3001/api/llm/compare', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Complex analysis task...',
    agentId: 'agent_123',  // Will use credit
    modelTier: 'premium',
  }),
});
```

### Example 4: Auto-Selection

```javascript
const response = await fetch('http://localhost:3001/api/llm/compare', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Simple question',
    selectionMode: 'cheapest',  // Auto-select cheapest
  }),
});

const { data } = await response.json();
console.log(`Auto-selected: ${data.selectedModel}`);
```

---

## 🔧 Programmatic Usage

### TypeScript SDK Example

```typescript
import {
  getLLMExecutionEngine,
  getAgentCreditScorer,
  LLMIntentParams,
} from '@synapse/core/llm';

// Initialize engine with API keys
const engine = getLLMExecutionEngine({
  openaiApiKey: process.env.OPENAI_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  googleApiKey: process.env.GOOGLE_API_KEY,
});

// Execute comparison
const params: LLMIntentParams = {
  prompt: 'Explain quantum entanglement',
  modelTier: 'balanced',
  minModels: 3,
  maxModels: 5,
  compareBy: ['cost', 'quality', 'latency'],
};

const result = await engine.executeComparison('intent_123', params);

console.log(`Total cost: $${result.totalCost}`);
console.log(`Best model: ${result.comparison.recommended}`);

// Display results
result.results.forEach((r) => {
  console.log(`\n#${r.rank} ${r.modelName}`);
  console.log(`  Cost: $${r.cost.toFixed(4)}`);
  console.log(`  Latency: ${r.latencyMs}ms`);
  console.log(`  Quality: ${(r.scores.quality * 100).toFixed(0)}/100`);
  console.log(`  Badges: ${r.badges.join(', ')}`);
});
```

### Credit System Usage

```typescript
import { getAgentCreditScorer } from '@synapse/core/llm';

const scorer = getAgentCreditScorer();

// Create profile
const profile = await scorer.getOrCreateProfile('agent_123', '0xWallet');
console.log(`Credit Score: ${profile.creditScore} (${profile.creditTier})`);
console.log(`Available Credit: $${profile.availableCredit}`);

// Use credit
await scorer.recordCreditUse('agent_123', 0.50, 'intent_123');

// Record payment
await scorer.recordPayment('agent_123', 0.50, true);

// Check updated score
const updated = await scorer.updateCreditScore('agent_123');
console.log(`New Score: ${updated.creditScore}`);
```

### Streaming Payments

```typescript
import { getStreamingPaymentController } from '@synapse/core/llm';

const controller = getStreamingPaymentController();

// Create stream
const stream = await controller.createStream({
  intentId: 'intent_123',
  modelId: 'gpt-4-turbo',
  payer: '0xClient',
  payee: '0xPlatform',
  costPerToken: 0.00003,
  maxAmount: 1.0,
});

// Simulate token streaming
for (let i = 0; i < 100; i++) {
  await controller.streamTokens(stream.streamId, 1);
}

// Pause if unhappy with quality
await controller.pauseStream(stream.streamId, 'quality_drop');

// Resume
await controller.resumeStream(stream.streamId);

// Complete and settle
await controller.completeStream(stream.streamId);
```

---

## 🛠️ MCP Monetization

Turn any MCP server into a revenue stream with one line of code.

### Basic Example

```typescript
import { monetize, PerCallPricing } from '@synapse/core/llm';

const service = monetize({
  serverId: 'my-weather-server',
  serverName: 'Premium Weather API',
  recipient: '0xMyWallet',
  defaultPricing: PerCallPricing(0.001),  // $0.001 per call
});

// Process tool call
const result = await service.processToolCall('my-weather-server', 'get_weather', {
  agentId: 'agent_123',
  creditTier: 'excellent',
  isDaoMember: false,
});

console.log(`Charged: $${result.finalPrice}`);
console.log(`You earned: $${result.earnings.toolCreator}`);
```

### Advanced Pricing

```typescript
import {
  monetize,
  PerTokenPricing,
  FreemiumPricing,
  PerKBPricing,
} from '@synapse/core/llm';

const service = monetize({
  serverId: 'advanced-tools',
  serverName: 'Advanced Tool Suite',
  recipient: '0xWallet',

  // Default: freemium
  defaultPricing: FreemiumPricing(100, 0.002),

  // Per-tool overrides
  toolPricing: {
    'analyze_document': PerTokenPricing(0.00002, 0.00006),
    'process_image': PerKBPricing(0.0001),
    'quick_lookup': PerCallPricing(0.0001),
  },

  // Revenue split
  revenueSplit: {
    toolCreator: 0.70,    // 70% to you
    platform: 0.30,       // 30% to Synapse
  },

  // Volume discounts
  volumeDiscounts: [
    { minCalls: 1000, discount: 0.10 },    // 10% off after 1000 calls
    { minCalls: 10000, discount: 0.20 },   // 20% off after 10000 calls
  ],

  // Credit tier discounts
  creditTierDiscounts: {
    exceptional: 0.20,   // 20% off for top tier
    excellent: 0.15,
    good: 0.10,
  },

  // DAO member discount
  daoDiscount: 0.15,
});
```

### Earnings Report

```typescript
const now = Date.now();
const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

const report = service.getEarningsReport('my-server', weekAgo, now);

console.log(`Total Earnings: $${report.totalEarnings}`);
console.log(`Total Calls: ${report.totalCalls}`);
console.log(`Unique Callers: ${report.uniqueCallers}`);
console.log(`\nProjections:`);
console.log(`  Daily: $${report.projections.daily.toFixed(2)}`);
console.log(`  Monthly: $${report.projections.monthly.toFixed(2)}`);
console.log(`\nTop Tools:`);
report.byTool.forEach(tool => {
  console.log(`  ${tool.toolName}: ${tool.calls} calls, $${tool.earnings.toFixed(4)}`);
});
```

---

## 📊 Credit Tier Benefits

| Tier | Score | Credit Limit | Discount | Escrow Required |
|------|-------|--------------|----------|-----------------|
| **Exceptional** | 800-850 | $10,000 | 20% off | None |
| **Excellent** | 740-799 | $5,000 | 15% off | 25% |
| **Good** | 670-739 | $1,000 | 10% off | 50% |
| **Fair** | 580-669 | $200 | None | 100% |
| **Subprime** | 300-579 | $0 | +10% fee | 100% |

### How to Improve Your Score

1. **Pay on time** (35% weight) - Always pay credit balances promptly
2. **Low utilization** (30% weight) - Keep balance under 30% of limit
3. **Account age** (15% weight) - Longer history is better
4. **Credit mix** (10% weight) - Variety of transaction types
5. **Recent activity** (10% weight) - Regular successful payments

---

## 🎯 Model Selection Strategies

### Budget-Conscious

```json
{
  "modelTier": "budget",
  "compareBy": ["cost"],
  "selectionMode": "cheapest"
}
```

### Quality-First

```json
{
  "modelTier": "premium",
  "compareBy": ["quality", "latency"],
  "selectionMode": "highest_quality"
}
```

### Balanced

```json
{
  "modelTier": "balanced",
  "compareBy": ["cost", "quality", "latency"],
  "selectionMode": "best_value"
}
```

### Specific Use Cases

```javascript
// For coding tasks
{
  models: ['gpt-4-turbo', 'claude-3-5-sonnet-20241022'],
  compareBy: ['quality']
}

// For quick lookups
{
  modelTier: 'budget',
  maxTokens: 100,
  selectionMode: 'fastest'
}

// For creative writing
{
  models: ['claude-3-opus-20240229', 'gpt-4-turbo'],
  temperature: 0.9,
  compareBy: ['quality']
}
```

---

## 🔐 Environment Variables

```bash
# LLM Provider API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
GROQ_API_KEY=gsk_...
TOGETHER_API_KEY=...

# Ollama (local)
OLLAMA_BASE_URL=http://localhost:11434

# Platform
SYNAPSE_PLATFORM_WALLET=0x...
```

---

## 📈 System Statistics

```bash
# Get model stats
curl http://localhost:3001/api/llm/models

# Get credit stats
curl http://localhost:3001/api/llm/credit/stats

# Get streaming stats
curl http://localhost:3001/api/llm/stream/stats
```

---

## 🚀 What's Next?

This implementation provides the foundation for:

1. ✅ Multi-LLM comparison
2. ✅ Credit score system
3. ✅ Streaming payments
4. ✅ MCP monetization
5. 🔄 Yield-bearing wallets (coming soon)
6. 🔄 Intent futures market (coming soon)
7. 🔄 Agent DAOs (coming soon)

**Ready to revolutionize AI agent economics!** 🤖💰
