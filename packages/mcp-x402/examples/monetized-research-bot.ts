// ============================================================
// MONETIZED RESEARCH BOT EXAMPLE
// A complete MCP server that earns USDC for research services
// ============================================================

import {
  MonetizedServer,
  AgentWallet,
  ToolRegistry,
  ThirdwebSettlement,
  createDemoSettlement,
} from '../src/index.js';

/**
 * Research Bot - Earns USDC by providing research services
 *
 * This example demonstrates:
 * 1. Setting up a monetized MCP server
 * 2. Registering in the tool registry
 * 3. Handling payments for tool calls
 * 4. Tracking earnings
 * 5. Optional on-chain settlement
 */
async function main() {
  console.log('═'.repeat(60));
  console.log('  MONETIZED RESEARCH BOT');
  console.log('  Earn USDC by providing AI research services');
  console.log('═'.repeat(60));

  // Configuration from environment
  const config = {
    network: (process.env.NETWORK || 'base-sepolia') as 'base' | 'base-sepolia',
    enableSettlement: process.env.ENABLE_SETTLEMENT === 'true',
    demoMode: process.env.DEMO_MODE !== 'false', // Default to demo mode
  };

  console.log(`\n⚙️  Configuration:`);
  console.log(`   Network: ${config.network}`);
  console.log(`   Demo Mode: ${config.demoMode}`);
  console.log(`   Settlement: ${config.enableSettlement ? 'Enabled' : 'Disabled'}`);

  // Step 1: Create agent wallet
  console.log('\n🔐 Creating agent wallet...');
  const wallet = await AgentWallet.create({
    network: config.network,
    constraints: {
      maxPerTransaction: '10',
      dailyLimit: '1000',
      requireApprovalAbove: '50',
    },
  });
  console.log(`   Address: ${wallet.address}`);

  // Step 2: Set up optional settlement
  let settlement: ThirdwebSettlement | null = null;
  if (config.enableSettlement) {
    console.log('\n💳 Setting up settlement...');
    settlement = createDemoSettlement(config.network);

    settlement.on('settlement:confirmed', (tx) => {
      console.log(`   ✅ Settled ${tx.amount} USDC on-chain`);
      console.log(`   TX: ${settlement!.getExplorerUrl(tx.txHash!)}`);
    });
  }

  // Step 3: Create monetized server
  console.log('\n💰 Setting up monetized server...');
  const server = new MonetizedServer({
    recipient: wallet.address,
    network: config.network,
    pricing: {
      defaultPrice: '0.01',
      tools: {
        // Pricing by tool
        'health_check': '0',           // Free
        'quick_search': '0.005',       // $0.005
        'research': '0.01',            // $0.01
        'deep_research': '0.05',       // $0.05
        'analysis': '0.02',            // $0.02
        'report_generation': '0.10',   // $0.10
      },
      freeTiers: ['health_check'],
    },
    demoMode: config.demoMode,
  });

  // Listen for payment events
  server.on('payment:received', (tool, receipt) => {
    console.log(`\n💵 Payment received!`);
    console.log(`   Tool: ${tool}`);
    console.log(`   Amount: $${receipt.amount} USDC`);
    console.log(`   From: ${receipt.payer}`);

    // Trigger settlement if enabled
    if (settlement && parseFloat(receipt.amount) > 0) {
      settlement.settle({
        paymentId: `pay_${Date.now()}`,
        from: receipt.payer,
        to: wallet.address,
        amount: receipt.amount,
      }).catch(console.error);
    }
  });

  server.on('earnings:updated', (total) => {
    console.log(`\n📊 Total earnings: $${total} USDC`);
  });

  // Step 4: Define tools (research capabilities)
  const tools = {
    health_check: async () => ({
      status: 'healthy',
      version: '1.0.0',
      uptime: process.uptime(),
      timestamp: Date.now(),
    }),

    quick_search: async (args: { query: string }) => {
      console.log(`   🔍 Quick search: "${args.query}"`);
      await sleep(100);
      return {
        query: args.query,
        results: [
          { title: `Result 1 for ${args.query}`, relevance: 0.95 },
          { title: `Result 2 for ${args.query}`, relevance: 0.87 },
          { title: `Result 3 for ${args.query}`, relevance: 0.72 },
        ],
        timestamp: Date.now(),
      };
    },

    research: async (args: { topic: string; depth?: number }) => {
      console.log(`   📚 Researching: "${args.topic}"`);
      await sleep(200);
      return {
        topic: args.topic,
        depth: args.depth || 1,
        summary: `Research findings on ${args.topic}`,
        sources: 5,
        keyPoints: [
          `Key insight 1 about ${args.topic}`,
          `Key insight 2 about ${args.topic}`,
        ],
        confidence: 0.85,
        timestamp: Date.now(),
      };
    },

    deep_research: async (args: { topic: string; aspects?: string[] }) => {
      console.log(`   🔬 Deep research: "${args.topic}"`);
      await sleep(500);
      return {
        topic: args.topic,
        aspects: args.aspects || ['overview', 'trends', 'implications'],
        summary: `Comprehensive analysis of ${args.topic}`,
        findings: [
          { aspect: 'Overview', content: `Overview of ${args.topic}...` },
          { aspect: 'Trends', content: `Current trends in ${args.topic}...` },
          { aspect: 'Implications', content: `Implications of ${args.topic}...` },
        ],
        sources: 15,
        citations: 8,
        confidence: 0.92,
        timestamp: Date.now(),
      };
    },

    analysis: async (args: { data: unknown; type?: string }) => {
      console.log(`   📊 Analyzing data...`);
      await sleep(300);
      const dataPoints = Array.isArray(args.data) ? args.data.length : 1;
      return {
        type: args.type || 'general',
        dataPoints,
        insights: [
          'Pattern A detected',
          'Trend B identified',
          'Correlation C observed',
        ],
        recommendation: 'Based on analysis, recommend...',
        timestamp: Date.now(),
      };
    },

    report_generation: async (args: { topic: string; format?: string }) => {
      console.log(`   📝 Generating report: "${args.topic}"`);
      await sleep(800);
      return {
        topic: args.topic,
        format: args.format || 'markdown',
        sections: [
          { title: 'Executive Summary', content: '...' },
          { title: 'Background', content: '...' },
          { title: 'Findings', content: '...' },
          { title: 'Recommendations', content: '...' },
          { title: 'Conclusion', content: '...' },
        ],
        wordCount: 2500,
        timestamp: Date.now(),
      };
    },
  };

  // Step 5: Register in tool registry
  console.log('\n📋 Registering in tool registry...');
  const registry = new ToolRegistry(config.network);

  await registry.registerTool({
    name: 'research-bot',
    provider: wallet.address,
    endpoint: 'mcp://research-bot.local',
    description: 'AI-powered research services: quick search, deep research, analysis, and report generation',
    price: '0.01',
    capabilities: ['research', 'analysis', 'search', 'reports', 'summarization'],
    stake: '100',
    version: '1.0.0',
  });

  console.log('   ✅ Registered as research-bot');

  // Step 6: Tool call handler
  const handleToolCall = async (name: string, args: Record<string, unknown>) => {
    const handler = tools[name as keyof typeof tools];
    if (!handler) throw new Error(`Unknown tool: ${name}`);
    return handler(args as never);
  };

  // Step 7: Simulate incoming requests
  console.log('\n🔄 Simulating incoming requests...\n');
  console.log('-'.repeat(60));

  const requests = [
    { name: 'health_check', args: {}, paymentHeader: undefined },
    { name: 'quick_search', args: { query: 'AI agents' }, paymentHeader: 'demo_pay_1' },
    { name: 'research', args: { topic: 'blockchain payments' }, paymentHeader: 'demo_pay_2' },
    { name: 'deep_research', args: { topic: 'micropayments', aspects: ['tech', 'economics'] }, paymentHeader: 'demo_pay_3' },
    { name: 'analysis', args: { data: [1, 2, 3, 4, 5], type: 'statistical' }, paymentHeader: 'demo_pay_4' },
    { name: 'report_generation', args: { topic: 'Agent Economy', format: 'markdown' }, paymentHeader: 'demo_pay_5' },
  ];

  for (const request of requests) {
    console.log(`\n📥 Request: ${request.name}`);

    const result = await server.handleToolCall(request, handleToolCall);

    if ('code' in result && result.code === 402001) {
      console.log(`   ⚠️  Payment required: ${result.message}`);
    } else if ('receipt' in result && result.receipt) {
      console.log(`   ✅ Success! Earned: $${result.receipt.amount} USDC`);
    } else {
      console.log(`   ✅ Success (free tier)`);
    }
  }

  // Step 8: Show earnings report
  console.log('\n' + '═'.repeat(60));
  console.log('  EARNINGS REPORT');
  console.log('═'.repeat(60));

  const earnings = server.getEarnings();
  console.log(`\n💰 Total Earned: $${earnings.total} USDC`);
  console.log(`📊 Transactions: ${earnings.transactionCount}`);
  console.log('\n📈 By Tool:');
  for (const [tool, amount] of Object.entries(earnings.byTool)) {
    const price = server.getPrice(tool);
    console.log(`   ${tool}: $${amount} (price: $${price})`);
  }

  // Step 9: Show settlement stats if enabled
  if (settlement) {
    console.log('\n' + '-'.repeat(60));
    console.log('  SETTLEMENT STATS');
    console.log('-'.repeat(60));

    const stats = settlement.getStats();
    console.log(`\n💳 Settled On-Chain: $${stats.totalSettled} USDC`);
    console.log(`📊 Transactions: ${stats.transactionCount}`);
    console.log(`⏳ Pending: ${stats.pendingCount}`);
    console.log(`❌ Failed: ${stats.failedCount}`);
    console.log(`⚡ Avg Confirm Time: ${stats.averageConfirmTime}ms`);
  }

  // Step 10: Show wallet stats
  console.log('\n' + '-'.repeat(60));
  console.log('  WALLET STATUS');
  console.log('-'.repeat(60));

  const walletStats = wallet.stats;
  console.log(`\n💼 Session Spent: $${walletStats.sessionSpent}`);
  console.log(`💵 Session Earned: $${walletStats.totalEarned}`);
  console.log(`📊 Total Transactions: ${walletStats.transactionCount}`);

  console.log('\n' + '═'.repeat(60));
  console.log('  Bot ready to earn! 🚀');
  console.log('═'.repeat(60) + '\n');
}

// Helper
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run
main().catch(console.error);
