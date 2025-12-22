# MCP x402: Monetizing AI Tools with HTTP-Native Payments

## The Innovation

**MCP x402** is a protocol that enables **any MCP server to become monetizable** through HTTP-native micropayments. When an AI agent calls a paid tool, it automatically handles payment using the x402 protocol and USDC on Base.

### The Problem

Today's MCP ecosystem has no native payment mechanism:
- MCP servers provide tools for free or via API keys
- No way for tool providers to monetize per-call
- No standard for AI agents to pay for services
- Centralized billing systems don't scale for agent-to-agent transactions

### The Solution

**x402 + MCP = Pay-per-call AI tools**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   AI Agent      │    │   MCP Server    │    │   Blockchain    │
│  (MCP Client)   │───▶│  (with x402)    │───▶│   (Base/USDC)   │
│                 │    │                 │    │                 │
│  Has wallet     │    │  Has paywall    │    │  Settles        │
│  Auto-pays      │    │  Verifies sigs  │    │  payments       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## Architecture Overview

### Core Components

```
packages/mcp-x402/
├── src/
│   ├── types.ts              # Core x402 types for MCP
│   ├── server/               # Server-side SDK
│   │   ├── index.ts          # Main exports
│   │   ├── paywall.ts        # x402 paywall for MCP tools
│   │   ├── pricing.ts        # Dynamic pricing engine
│   │   └── verifier.ts       # Payment verification
│   ├── client/               # Client-side SDK
│   │   ├── index.ts          # Main exports
│   │   ├── wallet.ts         # Wallet integration
│   │   ├── auto-pay.ts       # Automatic payment handling
│   │   └── budget.ts         # Budget management
│   └── index.ts              # Package exports
```

---

## Payment Flow

### 1. Standard x402 Flow for MCP Tools

```
AI Agent                    MCP Server                    Blockchain
    │                           │                             │
    │  1. tools/call            │                             │
    │  (no payment)             │                             │
    │ ─────────────────────────▶│                             │
    │                           │                             │
    │  2. 402 Payment Required  │                             │
    │  + X-Payment header       │                             │
    │ ◀─────────────────────────│                             │
    │                           │                             │
    │  3. Sign payment          │                             │
    │  (EIP-712 typed data)     │                             │
    │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│                             │
    │                           │                             │
    │  4. tools/call            │                             │
    │  + X-Payment (signed)     │                             │
    │ ─────────────────────────▶│                             │
    │                           │                             │
    │                           │  5. Verify signature        │
    │                           │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
    │                           │                             │
    │                           │  6. Settle payment          │
    │                           │ ───────────────────────────▶│
    │                           │                             │
    │                           │  7. Confirmation            │
    │                           │ ◀───────────────────────────│
    │                           │                             │
    │  8. Tool result           │                             │
    │  + Payment receipt        │                             │
    │ ◀─────────────────────────│                             │
    │                           │                             │
```

### 2. Pre-Authorized Payment Flow (Optimized)

For trusted clients, skip the 402 dance:

```
AI Agent                    MCP Server                    Blockchain
    │                           │                             │
    │  1. tools/call            │                             │
    │  + Pre-signed payment     │                             │
    │ ─────────────────────────▶│                             │
    │                           │                             │
    │                           │  2. Verify & settle         │
    │                           │ ───────────────────────────▶│
    │                           │                             │
    │  3. Tool result           │                             │
    │  + Receipt                │                             │
    │ ◀─────────────────────────│                             │
    │                           │                             │
```

---

## Server SDK Design

### Creating a Paid MCP Server

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { withX402Paywall, X402Pricing } from '@synapse/mcp-x402/server';

// Define pricing for your tools
const pricing: X402Pricing = {
  recipient: '0xYourWalletAddress',
  network: 'base-sepolia',  // or 'base' for mainnet
  defaultPrice: '0.001',    // $0.001 default
  tools: {
    'expensive_analysis': '0.01',   // $0.01
    'premium_data': '0.005',        // $0.005
    'basic_lookup': '0.0001',       // $0.0001
  },
  // Optional: Free tools
  freeTiers: ['health_check', 'get_info'],
};

// Wrap your MCP server with x402 paywall
const server = withX402Paywall(
  new Server({
    name: 'my-paid-mcp-server',
    version: '1.0.0',
  }),
  pricing
);

// Define tools as normal - paywall is automatic!
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'expensive_analysis',
      description: 'Deep analysis (costs $0.01)',
      inputSchema: { type: 'object', properties: { data: { type: 'string' } } },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Payment already verified by paywall!
  // Just implement your tool logic
  return { content: [{ type: 'text', text: 'Result here' }] };
});
```

### Paywall Behavior

The `withX402Paywall` wrapper:

1. **Intercepts tool calls** before they reach your handler
2. **Checks if tool requires payment** based on pricing config
3. **Returns 402** with payment requirements if no payment provided
4. **Verifies payment signature** using EIP-712
5. **Settles payment on-chain** via Thirdweb facilitator
6. **Attaches receipt** to successful responses

---

## Client SDK Design

### Auto-Paying MCP Client

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { withX402AutoPay, X402Wallet } from '@synapse/mcp-x402/client';

// Configure wallet for payments
const wallet: X402Wallet = {
  address: '0xYourAgentWallet',
  signer: privateKeyOrSignerFunction,
  network: 'base-sepolia',
};

// Budget controls
const budgetConfig = {
  maxPerCall: '0.05',      // Max $0.05 per tool call
  sessionBudget: '1.00',   // Max $1.00 per session
  autoApproveUnder: '0.01', // Auto-approve under $0.01
};

// Wrap MCP client with auto-pay
const client = withX402AutoPay(
  new Client({
    name: 'my-ai-agent',
    version: '1.0.0',
  }),
  wallet,
  budgetConfig
);

// Use tools normally - payments are automatic!
const result = await client.callTool({
  name: 'expensive_analysis',
  arguments: { data: 'analyze this' },
});

// Result includes payment receipt
console.log(result.receipt);
// { amount: '0.01', txHash: '0x...', settled: true }
```

### Payment Handling

The `withX402AutoPay` wrapper:

1. **Intercepts 402 responses** from servers
2. **Parses payment requirements** from X-Payment header
3. **Checks against budget limits** before paying
4. **Signs EIP-712 payment authorization**
5. **Retries request** with payment attached
6. **Tracks spending** for budget management

---

## Protocol Extensions

### MCP Protocol Extensions for x402

We extend the MCP protocol with x402-specific methods:

```typescript
// New MCP methods for x402
interface MCPx402Methods {
  // Get payment requirements for a tool before calling
  'x402/getPrice': {
    params: { tool: string };
    result: { price: string; network: string; recipient: string };
  };

  // Get current session spending
  'x402/getSpending': {
    params: {};
    result: { spent: string; budget: string; transactions: number };
  };

  // Pre-authorize a budget for faster payments
  'x402/preAuthorize': {
    params: { amount: string; validUntil: number };
    result: { authorizationId: string; signature: string };
  };
}
```

### Tool Metadata Extension

Tools can include x402 pricing in their schema:

```typescript
{
  name: 'premium_data',
  description: 'Get premium data',
  inputSchema: { ... },
  // x402 extension
  _x402: {
    price: '0.005',
    network: 'base-sepolia',
    recipient: '0x...',
    description: 'Premium data access'
  }
}
```

---

## Security Model

### Payment Verification

1. **Signature Verification**: EIP-712 typed data ensures payment authorization is cryptographically signed by the payer
2. **Nonce Uniqueness**: Each payment has a unique nonce to prevent replay attacks
3. **Expiration**: Payments expire to prevent stale authorizations
4. **Amount Verification**: Server verifies payment amount matches required price

### Trust Model

```
┌─────────────────────────────────────────────────────────────┐
│                      Trust Levels                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Level 0: No Trust (Default)                               │
│  - Full 402 flow for every call                            │
│  - Payment verified before execution                        │
│                                                             │
│  Level 1: Pre-Authorization                                │
│  - Client pre-authorizes a budget                          │
│  - Server deducts from pre-auth                            │
│  - Faster calls, settlement batched                         │
│                                                             │
│  Level 2: Subscriptions (Future)                           │
│  - Time-based access tokens                                │
│  - Unlimited calls within period                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Core Protocol (Current Focus)
- [ ] x402 types for MCP
- [ ] Server paywall wrapper
- [ ] Payment verification
- [ ] Client auto-pay wrapper
- [ ] Basic wallet integration

### Phase 2: Enhanced Features
- [ ] Dynamic pricing (based on input size, complexity)
- [ ] Pre-authorization flow
- [ ] Batch settlement
- [ ] Multi-tool discounts

### Phase 3: Ecosystem
- [ ] MCP server registry with x402 support
- [ ] Agent marketplace
- [ ] Reputation system
- [ ] Dispute resolution

---

## Example Use Cases

### 1. Paid Data Provider

```typescript
// Weather data MCP server with x402
const weatherServer = withX402Paywall(server, {
  recipient: '0xWeatherProvider',
  tools: {
    'get_current_weather': '0.001',  // Basic weather
    'get_forecast_7day': '0.005',    // 7-day forecast
    'get_historical_data': '0.01',   // Historical data
  },
});
```

### 2. AI Model Access

```typescript
// Premium AI model access via MCP
const aiServer = withX402Paywall(server, {
  recipient: '0xAIProvider',
  tools: {
    'generate_image': '0.02',      // Image generation
    'analyze_document': '0.005',   // Document analysis
    'translate_text': '0.001',     // Translation
  },
});
```

### 3. Compute Resources

```typescript
// Serverless compute via MCP
const computeServer = withX402Paywall(server, {
  recipient: '0xComputeProvider',
  dynamicPricing: (tool, args) => {
    // Price based on compute needed
    const complexity = estimateComplexity(args);
    return (complexity * 0.001).toFixed(6);
  },
});
```

---

## Integration with Synapse

The existing Synapse components integrate as follows:

```
┌─────────────────────────────────────────────────────────────────┐
│                    SYNAPSE ECOSYSTEM                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐   │
│  │   @synapse/  │     │   @synapse/  │     │   @synapse/  │   │
│  │   mcp-x402   │────▶│     core     │────▶│     sdk      │   │
│  │              │     │  (x402 impl) │     │  (wallets)   │   │
│  └──────────────┘     └──────────────┘     └──────────────┘   │
│         │                    │                    │            │
│         ▼                    ▼                    ▼            │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                    MCP Servers                            │ │
│  │  • Weather Bot (example)                                  │ │
│  │  • Crypto Bot (example)                                   │ │
│  │  • Any third-party MCP server                             │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Structure After Implementation

```
packages/
├── mcp-x402/                    # NEW: Core x402 MCP SDK
│   ├── src/
│   │   ├── types.ts             # x402 + MCP types
│   │   ├── server/
│   │   │   ├── paywall.ts       # withX402Paywall wrapper
│   │   │   ├── pricing.ts       # Pricing configuration
│   │   │   └── verifier.ts      # Payment verification
│   │   ├── client/
│   │   │   ├── auto-pay.ts      # withX402AutoPay wrapper
│   │   │   ├── wallet.ts        # Wallet abstraction
│   │   │   └── budget.ts        # Budget tracking
│   │   └── index.ts
│   └── package.json
│
├── core/                        # Existing: Core logic
│   └── src/x402/                # x402 implementation (reused)
│
├── sdk/                         # Existing: Client SDK
│   └── src/crossmint/           # Wallet integration (reused)
│
└── mcp-gateway/                 # Existing: MCP Gateway
    └── (uses mcp-x402 for payments)

providers/                       # Example MCP servers with x402
├── weather-bot/                 # Example: Weather with x402
├── crypto-bot/                  # Example: Crypto with x402
└── news-bot/                    # Example: News with x402
```

---

## Why This Matters

### For AI Agents
- **Autonomous spending**: Agents can pay for tools they need
- **Budget controls**: Operators set spending limits
- **No API keys**: Pay-per-use, no accounts needed

### For Tool Providers
- **Instant monetization**: Add x402 to any MCP server
- **Global payments**: USDC on Base, no geographic limits
- **Fair pricing**: Charge what your tool is worth

### For The Ecosystem
- **Open marketplace**: Any tool, any price, any agent
- **Decentralized**: No central billing authority
- **Composable**: Agents can chain paid tools together

---

## Next Steps

1. **Review this architecture** - Does this capture the innovation?
2. **Implement core types** - Already started in `packages/mcp-x402/src/types.ts`
3. **Build server paywall** - `withX402Paywall` wrapper
4. **Build client auto-pay** - `withX402AutoPay` wrapper
5. **Update examples** - Convert bots to use new SDK
6. **Documentation** - Developer guides and tutorials

---

## Questions to Consider

1. **Pricing Strategy**: Should we support dynamic pricing based on input complexity?
2. **Pre-Authorization**: How long should pre-authorizations be valid?
3. **Batch Settlement**: Should we batch multiple small payments?
4. **Error Handling**: What happens if payment fails mid-execution?
5. **Refunds**: How do we handle refunds for failed tool calls?

---

*This document defines the MCP x402 architecture. The goal is to make every MCP tool monetizable with a single wrapper function.*
