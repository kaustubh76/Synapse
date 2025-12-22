# @synapse/mcp-x402

## The Agent Economy Protocol

Revolutionary infrastructure for autonomous AI agent payments using x402 and MCP (Model Context Protocol).

```
     ╔═══════════════════════════════════════════════════════════════╗
     ║                                                               ║
     ║   🤖 AGENTS BECOME FIRST-CLASS ECONOMIC CITIZENS 🤖          ║
     ║                                                               ║
     ║   • Earn USDC by providing services                          ║
     ║   • Spend autonomously within safety limits                  ║
     ║   • Form collectives and share revenue                       ║
     ║   • Build reputation through quality service                 ║
     ║                                                               ║
     ╚═══════════════════════════════════════════════════════════════╝
```

## Features

### Core Components

| Component | Description |
|-----------|-------------|
| **Agent Wallets** | Cryptographic identity with spending constraints |
| **Payment Channels** | Off-chain micropayments (1000s of txs, 2 on-chain) |
| **Intent Resolution** | Express WHAT you want, protocol finds HOW |
| **Tool Registry** | Decentralized discovery with staking & reputation |
| **Safety Protocol** | Multi-layer protection against runaway spending |
| **Server SDK** | Monetize any MCP server with one wrapper |
| **Client SDK** | Auto-pay for tools within budget constraints |
| **EIP-712 Signing** | Standard Ethereum typed data signatures |
| **Settlement** | Thirdweb-powered on-chain settlement |

## Quick Start

### Installation

```bash
npm install @synapse/mcp-x402
```

### Create an Agent Economy Stack

```typescript
import { createAgentEconomy } from '@synapse/mcp-x402';

// Create complete agent infrastructure
const economy = await createAgentEconomy({
  network: 'base-sepolia',
  budget: {
    maxPerTransaction: '1.00',
    sessionBudget: '10.00',
    autoApproveUnder: '0.10',
  },
});

// Now your agent can:
// - Hold a wallet with cryptographic identity
// - Pay for tools automatically
// - Earn by providing services
// - Track all transactions with safety checks

console.log(`Agent wallet: ${economy.wallet.address}`);
```

### Monetize Your MCP Server

```typescript
import { MonetizedServer } from '@synapse/mcp-x402';

// Wrap your existing MCP server with payments
const server = new MonetizedServer({
  recipient: '0xYourWalletAddress',
  network: 'base-sepolia',
  pricing: {
    defaultPrice: '0.01',
    tools: {
      'quick_research': '0.005',
      'deep_research': '0.05',
      'analysis': '0.02',
      'health_check': '0',
    },
    freeTiers: ['health_check'],
  },
});

// Listen for earnings
server.on('payment:received', (tool, receipt) => {
  console.log(`Earned ${receipt.amount} USDC from ${tool}`);
});

// Handle tool calls with automatic payment verification
const result = await server.handleToolCall(request, async (args) => {
  // Your tool implementation
  return doResearch(args);
});
```

### Auto-Pay Client

```typescript
import { AutoPayClient, createAgentWallet } from '@synapse/mcp-x402';

// Create wallet
const wallet = await createAgentWallet('base-sepolia');

// Create auto-pay client
const client = new AutoPayClient({
  wallet,
  network: 'base-sepolia',
  budget: {
    maxPerTransaction: '0.50',
    sessionBudget: '5.00',
    autoApproveUnder: '0.10',
  },
  enableSafety: true,
});

// Call tools - payments happen automatically
const result = await client.callTool({
  tool: 'deep_research',
  serverUrl: 'https://research-agent.example.com',
  args: { topic: 'AI economics' },
});

console.log(`Result: ${result.result}`);
console.log(`Cost: ${result.payment?.amount} USDC`);
```

## Architecture

### Payment Flow

```
   ┌─────────────────────────────────────────────────────────────────┐
   │                      PAYMENT FLOW                               │
   ├─────────────────────────────────────────────────────────────────┤
   │                                                                 │
   │  ┌──────────┐     1. tools/call      ┌──────────────────┐      │
   │  │  Client  │ ───────────────────────▶│   MCP Server     │      │
   │  │  Agent   │                         │  (Monetized)     │      │
   │  └────┬─────┘                         └────────┬─────────┘      │
   │       │                                        │                │
   │       │                               2. 402 Payment Required   │
   │       │ ◀─────────────────────────────────────┘                 │
   │       │   { requirements, header }                              │
   │       │                                                         │
   │       │  3. Sign EIP-712 Payment                                │
   │       ▼                                                         │
   │  ┌──────────┐                                                   │
   │  │  Wallet  │                                                   │
   │  │  + Keys  │                                                   │
   │  └────┬─────┘                                                   │
   │       │                                                         │
   │       │  4. Retry with X-Payment header                         │
   │       ▼                                                         │
   │  ┌──────────────────┐  5. Verify   ┌──────────────────┐        │
   │  │   MCP Server     │ ◀───────────▶│   x402 Protocol  │        │
   │  │   (Verified)     │              │   Verification   │        │
   │  └────────┬─────────┘              └──────────────────┘        │
   │           │                                                     │
   │           │  6. Execute & Return Result                         │
   │           ▼                                                     │
   │  ┌──────────────────┐                                          │
   │  │   Tool Result    │                                          │
   │  │   + Receipt      │                                          │
   │  └──────────────────┘                                          │
   │                                                                 │
   └─────────────────────────────────────────────────────────────────┘
```

### Safety Protocol

The safety protocol provides 4 layers of protection:

```typescript
import { AgentSafetyProtocol, DEFAULT_SAFETY_CONFIG } from '@synapse/mcp-x402';

const safety = new AgentSafetyProtocol({
  // Layer 1: Rate Limiting
  rateLimit: {
    maxPerMinute: 20,
    maxPerHour: 100,
    maxPerDay: 500,
    cooldownMs: 30000,
  },

  // Layer 2: Anomaly Detection
  anomalyDetection: {
    enabled: true,
    baselineWindow: 3600000, // 1 hour
    deviationThreshold: 2.5,
    minSampleSize: 10,
  },

  // Layer 3: Circuit Breaker
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    resetTimeout: 60000,
    halfOpenRequests: 3,
  },

  // Layer 4: Circular Payment Detection
  circularPaymentDetection: {
    enabled: true,
    maxHops: 5,
    timeWindow: 3600000,
  },
});

// Check before any payment
const check = safety.check({
  recipient: '0x...',
  amount: '0.50',
  resource: 'research',
});

if (!check.allowed) {
  console.log(`Blocked: ${check.reason}`);
}
```

### Payment Channels

For high-frequency micropayments, use payment channels:

```typescript
import { PaymentChannelManager } from '@synapse/mcp-x402';

const channels = new PaymentChannelManager({
  network: 'base-sepolia',
  sender: wallet.address,
  signer: (msg) => wallet.sign(msg),
});

// Open channel with $10 capacity
const channel = await channels.openChannel({
  recipient: '0xProviderAddress',
  capacity: '10.00',
  duration: 3600, // 1 hour
});

// Make instant payments (off-chain)
await channel.pay('0.001', 'tool-call-1');
await channel.pay('0.001', 'tool-call-2');
await channel.pay('0.001', 'tool-call-3');
// ... 1000s more payments with no on-chain fees

// Close and settle (single on-chain transaction)
await channel.close();
```

### Intent-Based Payments

Let the protocol figure out the best way to fulfill your request:

```typescript
import { IntentResolver, intent } from '@synapse/mcp-x402';

// Express what you want
const result = await intent('Get current weather for NYC')
  .maxBudget('0.10')
  .preferFast()
  .execute();

// The protocol:
// 1. Parses your intent
// 2. Finds matching tools in registry
// 3. Ranks by price, reputation, latency
// 4. Executes best match
// 5. Handles payment automatically

console.log(result.data); // Weather data
console.log(result.cost); // What you paid
console.log(result.provider); // Who provided it
```

### Tool Registry

Register and discover tools:

```typescript
import { ToolRegistry } from '@synapse/mcp-x402';

const registry = new ToolRegistry('base-sepolia');

// Register your tool
await registry.registerTool({
  name: 'research-agent',
  provider: wallet.address,
  endpoint: 'mcp://my-research-server.com',
  description: 'Deep research on any topic',
  price: '0.05',
  capabilities: ['research', 'summarization', 'analysis'],
  stake: '100', // Stake $100 USDC to show commitment
});

// Discover tools
const tools = await registry.findByCapability('research');
console.log(`Found ${tools.length} research tools`);

// Get reputation
const rep = registry.getReputation('tool-id');
console.log(`Score: ${rep.score}/5 (${rep.totalRatings} ratings)`);
```

## Settlement

### Thirdweb Integration

For actual on-chain settlement:

```typescript
import { ThirdwebSettlement } from '@synapse/mcp-x402';

const settlement = new ThirdwebSettlement({
  network: 'base-sepolia',
  // Option 1: Direct private key
  privateKey: process.env.PRIVATE_KEY,
  // Option 2: Thirdweb Engine (recommended for production)
  engineUrl: 'https://engine.thirdweb.com',
  engineAccessToken: process.env.THIRDWEB_TOKEN,
  backendWallet: '0xYourBackendWallet',
  // Batching for efficiency
  enableBatching: true,
  batchWindow: 5000, // 5 seconds
  minSettlementAmount: '0.01',
});

// Listen for settlements
settlement.on('settlement:confirmed', (tx) => {
  console.log(`Settled ${tx.amount} USDC`);
  console.log(`TX: ${settlement.getExplorerUrl(tx.txHash)}`);
});

// Settle a payment
await settlement.settle({
  paymentId: 'pay_123',
  from: '0xSender',
  to: '0xRecipient',
  amount: '0.50',
});
```

## EIP-712 Signatures

Standard Ethereum typed data signing for payment authorization:

```typescript
import {
  createTypedData,
  createTypedDataHash,
  verifySignature,
} from '@synapse/mcp-x402';

// Create typed data for wallet signing
const typedData = createTypedData('base-sepolia', {
  recipient: '0xRecipient',
  amount: '500000', // 0.5 USDC in raw
  tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  nonce: '0x' + randomBytes(32).toString('hex'),
  expiry: Math.floor(Date.now() / 1000) + 300,
  resource: 'deep_research',
  network: 'base-sepolia',
});

// Sign with wallet (ethers.js example)
const signature = await wallet._signTypedData(
  typedData.domain,
  { Payment: typedData.types.Payment },
  typedData.message
);

// Verify on server
const verification = await verifySignature(
  'base-sepolia',
  typedData.message,
  signature,
  expectedPayerAddress
);

if (verification.valid) {
  // Process payment
}
```

## API Reference

### Agent Wallet

```typescript
class AgentWallet {
  address: string;
  balance: { total: string; available: string; locked: string };
  stats: WalletStats;

  static create(config: WalletConfig): Promise<AgentWallet>;
  signPayment(params: PaymentParams): Promise<{ signature: string; txRecord: TransactionRecord }>;
  canPay(amount: string, recipient: string): { allowed: boolean; reason?: string };
  updateBalance(available: string, locked: string): void;
}
```

### MonetizedServer

```typescript
class MonetizedServer {
  constructor(config: MonetizationConfig);
  handleToolCall<T>(request: ToolCallRequest, handler: Function): Promise<ToolCallResult>;
  getEarnings(): EarningsReport;
  on(event: 'payment:received', handler: (tool: string, receipt: Receipt) => void): this;
}
```

### AutoPayClient

```typescript
class AutoPayClient {
  constructor(config: AutoPayConfig);
  callTool(request: ToolCallRequest): Promise<AutoPayResult>;
  canPay(amount: string, tool: string, recipient: string): Promise<PaymentCheck>;
  getSpendingStats(): SpendingStats;
}
```

### PaymentChannel

```typescript
class PaymentChannel {
  open(): Promise<string>;
  pay(amount: string, resource: string): Promise<ChannelPayment>;
  close(): Promise<string>;
  getBalance(): { capacity: string; spent: string; remaining: string };
}
```

### ToolRegistry

```typescript
class ToolRegistry {
  registerTool(params: ToolRegistration): Promise<ToolRegistration>;
  findByCapability(capability: string): Promise<ToolCandidate[]>;
  search(query: string, options?: SearchOptions): Promise<ToolCandidate[]>;
  rateTool(toolId: string, params: RatingParams): Promise<void>;
  getReputation(toolId: string): ReputationScore | undefined;
}
```

## Environment Variables

```bash
# Network
X402_NETWORK=base-sepolia          # or 'base' for mainnet

# Payment Settings
X402_RECIPIENT=0x...               # Default payment recipient
X402_DEFAULT_PRICE=0.01            # Default tool price in USDC
X402_DEMO_MODE=true                # Skip payment verification

# Thirdweb Settlement
THIRDWEB_ENGINE_URL=https://...    # Thirdweb Engine URL
THIRDWEB_ACCESS_TOKEN=...          # Engine access token
THIRDWEB_BACKEND_WALLET=0x...      # Backend wallet address

# Safety Limits
X402_MAX_PER_TX=1.00               # Max per transaction
X402_SESSION_BUDGET=10.00          # Session budget
X402_AUTO_APPROVE_UNDER=0.10       # Auto-approve threshold
```

## Examples

See the `/examples` directory for complete examples:

- `earning-agent.ts` - Agent that earns by providing services
- `paying-agent.ts` - Agent that pays for tools
- `agent-swarm.ts` - Multiple agents with internal economy
- `payment-channel.ts` - High-frequency micropayments
- `intent-based.ts` - Intent resolution example

## Networks

| Network | Chain ID | USDC Address |
|---------|----------|--------------|
| Base | 8453 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Base Sepolia | 84532 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

## License

MIT

## Contributing

Contributions welcome! Please read our contributing guidelines before submitting PRs.

---

Built with the belief that AI agents deserve economic autonomy.
