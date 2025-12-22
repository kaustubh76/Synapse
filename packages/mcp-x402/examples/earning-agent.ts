// ============================================================
// EARNING AGENT EXAMPLE
// Demonstrates an agent that EARNS money by providing services
// Revolutionary: Agents become economic actors, not just consumers
// ============================================================

import {
  AgentWallet,
  MonetizedServer,
  ToolRegistry,
  X402Network,
} from '../src/index.js';

/**
 * Example: Research Agent that earns by doing research
 *
 * This agent:
 * 1. Registers itself as a tool provider
 * 2. Charges for research services
 * 3. Earns USDC for completed work
 * 4. Can use earnings to pay for other tools
 */
async function createEarningAgent() {
  const network: X402Network = 'base-sepolia';

  // Step 1: Create agent wallet
  console.log('🔐 Creating agent wallet...');
  const wallet = await AgentWallet.create({
    network,
    constraints: {
      maxPerTransaction: '10',
      dailyLimit: '100',
      requireApprovalAbove: '5',
    },
  });
  console.log(`   Address: ${wallet.address}`);

  // Step 2: Create monetized server for our services
  console.log('\n💰 Setting up monetized services...');
  const server = new MonetizedServer({
    recipient: wallet.address,
    network,
    pricing: {
      defaultPrice: '0.01',
      tools: {
        'quick_research': '0.005',      // $0.005 for quick research
        'deep_research': '0.05',        // $0.05 for deep research
        'analysis': '0.02',             // $0.02 for analysis
        'health_check': '0',            // Free health check
      },
      freeTiers: ['health_check'],
    },
    demoMode: true, // Demo mode for testing
  });

  // Listen to earnings
  server.on('payment:received', (tool, receipt) => {
    console.log(`\n💵 Earned ${receipt.amount} USDC from ${tool}`);
    console.log(`   From: ${receipt.payer}`);
  });

  server.on('earnings:updated', (total, byTool) => {
    console.log(`\n📊 Total earnings: $${total} USDC`);
    for (const [tool, amount] of Object.entries(byTool)) {
      console.log(`   ${tool}: $${amount}`);
    }
  });

  // Step 3: Define our tools (the services we provide)
  const tools = {
    health_check: async () => ({ status: 'healthy', timestamp: Date.now() }),

    quick_research: async (args: { topic: string }) => {
      // Simulate quick research
      await delay(100);
      return {
        topic: args.topic,
        summary: `Quick findings about ${args.topic}`,
        sources: 3,
        confidence: 0.7,
      };
    },

    deep_research: async (args: { topic: string; depth?: number }) => {
      // Simulate deep research
      await delay(500);
      return {
        topic: args.topic,
        summary: `Comprehensive analysis of ${args.topic}`,
        findings: [
          `Key insight 1 about ${args.topic}`,
          `Key insight 2 about ${args.topic}`,
          `Key insight 3 about ${args.topic}`,
        ],
        sources: 15,
        confidence: 0.95,
        depth: args.depth || 3,
      };
    },

    analysis: async (args: { data: unknown }) => {
      // Simulate analysis
      await delay(200);
      return {
        analyzed: true,
        dataPoints: Array.isArray(args.data) ? args.data.length : 1,
        insights: ['Pattern detected', 'Trend identified'],
      };
    },
  };

  // Step 4: Register in the tool registry
  console.log('\n📋 Registering in tool registry...');
  const registry = new ToolRegistry(network);

  await registry.registerTool({
    name: 'research-agent',
    provider: wallet.address,
    endpoint: 'mcp://research-agent.local',
    description: 'AI research agent that provides quick and deep research services',
    price: '0.01',
    capabilities: ['research', 'analysis', 'summarization'],
    stake: '100', // Stake $100 to show commitment
    version: '1.0.0',
  });

  console.log('   ✅ Registered as tool provider');

  // Step 5: Simulate some incoming requests
  console.log('\n🔄 Simulating incoming requests...\n');

  // Simulate tool call handler
  const handleToolCall = async (name: string, args: Record<string, unknown>) => {
    const handler = tools[name as keyof typeof tools];
    if (!handler) throw new Error(`Unknown tool: ${name}`);
    return handler(args as never);
  };

  // Simulate requests from other agents
  const requests = [
    { name: 'health_check', arguments: {}, paymentHeader: undefined },
    { name: 'quick_research', arguments: { topic: 'AI agents' }, paymentHeader: 'demo_payment_1' },
    { name: 'deep_research', arguments: { topic: 'blockchain economics' }, paymentHeader: 'demo_payment_2' },
    { name: 'analysis', arguments: { data: [1, 2, 3, 4, 5] }, paymentHeader: 'demo_payment_3' },
    { name: 'quick_research', arguments: { topic: 'micropayments' }, paymentHeader: 'demo_payment_4' },
  ];

  for (const request of requests) {
    console.log(`📥 Incoming: ${request.name}`);

    const result = await server.handleToolCall(request, handleToolCall);

    if ('code' in result && result.code === 402001) {
      console.log(`   💳 Payment required: ${result.message}`);
    } else if ('receipt' in result && result.receipt) {
      console.log(`   ✅ Completed, earned: $${result.receipt.amount}`);
    } else {
      console.log(`   ✅ Completed (free tier)`);
    }
  }

  // Step 6: Show final earnings
  console.log('\n' + '='.repeat(50));
  const earnings = server.getEarnings();
  console.log('📈 FINAL EARNINGS REPORT');
  console.log('='.repeat(50));
  console.log(`Total Earned: $${earnings.total} USDC`);
  console.log(`Transactions: ${earnings.transactionCount}`);
  console.log('\nBy Tool:');
  for (const [tool, amount] of Object.entries(earnings.byTool)) {
    console.log(`  ${tool}: $${amount}`);
  }

  // Step 7: Show wallet status
  console.log('\n' + '='.repeat(50));
  console.log('💼 WALLET STATUS');
  console.log('='.repeat(50));
  const stats = wallet.stats;
  console.log(`Session Spent: $${stats.sessionSpent}`);
  console.log(`Session Earned: $${stats.totalEarned}`);
  console.log(`Net Position: $${(parseFloat(stats.totalEarned) - parseFloat(stats.totalSpent)).toFixed(6)}`);

  return { wallet, server, registry };
}

/**
 * Example: Agent Swarm with Internal Economy
 *
 * Multiple agents working together, paying each other
 */
async function createAgentSwarm() {
  console.log('\n' + '='.repeat(60));
  console.log('🐝 AGENT SWARM EXAMPLE');
  console.log('='.repeat(60));

  const network: X402Network = 'base-sepolia';

  // Create specialized agents
  console.log('\n📦 Creating specialized agents...');

  // Research Agent
  const researchAgent = await AgentWallet.create({ network });
  console.log(`   🔬 Research Agent: ${researchAgent.address}`);

  // Analysis Agent
  const analysisAgent = await AgentWallet.create({ network });
  console.log(`   📊 Analysis Agent: ${analysisAgent.address}`);

  // Writing Agent
  const writingAgent = await AgentWallet.create({ network });
  console.log(`   ✍️  Writing Agent: ${writingAgent.address}`);

  // Orchestrator with budget
  const orchestrator = await AgentWallet.create({
    network,
    constraints: {
      maxPerTransaction: '1',
      dailyLimit: '10',
      requireApprovalAbove: '0.5',
    },
  });
  console.log(`   🎭 Orchestrator: ${orchestrator.address}`);

  // Simulate orchestrator funding (in real scenario, this comes from user)
  orchestrator.updateBalance('10000000', '0'); // $10 USDC

  console.log('\n💼 Orchestrator funded with $10 USDC');

  // Create task pipeline
  console.log('\n🔄 Executing task pipeline...');

  const tasks = [
    { agent: 'Research Agent', address: researchAgent.address, price: '0.50', task: 'Research AI economics' },
    { agent: 'Analysis Agent', address: analysisAgent.address, price: '0.30', task: 'Analyze research findings' },
    { agent: 'Writing Agent', address: writingAgent.address, price: '0.20', task: 'Write final report' },
  ];

  let totalSpent = 0;

  for (const task of tasks) {
    console.log(`\n   📋 Task: ${task.task}`);
    console.log(`      Agent: ${task.agent}`);
    console.log(`      Price: $${task.price}`);

    // Sign payment
    const canPay = orchestrator.canPay(task.price, task.address);
    if (!canPay.allowed) {
      console.log(`      ❌ Cannot pay: ${canPay.reason}`);
      continue;
    }

    const { signature } = await orchestrator.signPayment({
      recipient: task.address,
      amount: task.price,
      resource: task.task,
      reason: `Task: ${task.task}`,
      nonce: '0x' + Math.random().toString(16).slice(2).padStart(64, '0'),
      expiry: Math.floor(Date.now() / 1000) + 300,
    });

    totalSpent += parseFloat(task.price);
    console.log(`      ✅ Payment signed, agent earned $${task.price}`);
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 SWARM TASK SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total Tasks: ${tasks.length}`);
  console.log(`Total Spent: $${totalSpent.toFixed(2)} USDC`);
  console.log(`Remaining Budget: $${(10 - totalSpent).toFixed(2)} USDC`);

  return { researchAgent, analysisAgent, writingAgent, orchestrator };
}

// Helper
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run examples
async function main() {
  console.log('═'.repeat(60));
  console.log('  SYNAPSE MCP x402 - EARNING AGENT EXAMPLES');
  console.log('═'.repeat(60));

  try {
    // Run earning agent example
    await createEarningAgent();

    // Run agent swarm example
    await createAgentSwarm();

    console.log('\n✅ All examples completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
