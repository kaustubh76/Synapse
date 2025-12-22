// ============================================================
// PAYING AGENT EXAMPLE
// Demonstrates an agent that pays for services autonomously
// ============================================================

import {
  AutoPayClient,
  AgentWallet,
  AgentSafetyProtocol,
  DEFAULT_SAFETY_CONFIG,
} from '../src/index.js';

/**
 * Paying Agent - Autonomously pays for tools within budget
 *
 * This example demonstrates:
 * 1. Creating an agent wallet with spending constraints
 * 2. Setting up auto-pay client with budget limits
 * 3. Safety protocols to prevent runaway spending
 * 4. Tracking expenses and managing budgets
 */
async function main() {
  console.log('═'.repeat(60));
  console.log('  PAYING AGENT');
  console.log('  Autonomous AI agent that pays for services');
  console.log('═'.repeat(60));

  // Step 1: Create agent wallet with constraints
  console.log('\n🔐 Creating agent wallet...');
  const wallet = await AgentWallet.create({
    network: 'base-sepolia',
    constraints: {
      maxPerTransaction: '1.00',
      dailyLimit: '10.00',
      requireApprovalAbove: '0.50',
    },
  });
  console.log(`   Address: ${wallet.address}`);

  // Simulate wallet funding
  wallet.updateBalance('10000000', '0'); // $10 USDC
  console.log(`   Balance: $${(parseInt(wallet.balance.available) / 1_000_000).toFixed(2)} USDC`);

  // Step 2: Set up safety protocol
  console.log('\n🛡️  Setting up safety protocol...');
  const safety = new AgentSafetyProtocol({
    ...DEFAULT_SAFETY_CONFIG,
    rateLimit: {
      maxPerMinute: 10,
      maxPerHour: 50,
      maxPerDay: 100,
      cooldownMs: 5000,
    },
  });
  console.log('   ✅ Safety protocol active');
  console.log('   - Rate limit: 10/min, 50/hr, 100/day');
  console.log('   - Anomaly detection: enabled');
  console.log('   - Circuit breaker: enabled');

  // Step 3: Create auto-pay client
  console.log('\n💳 Creating auto-pay client...');
  const client = new AutoPayClient({
    wallet,
    network: 'base-sepolia',
    budget: {
      maxPerTransaction: '1.00',
      sessionBudget: '5.00',
      autoApproveUnder: '0.10',
    },
    enableSafety: true,
  });

  // Listen for events
  client.on('payment:approved', ({ tool, amount }) => {
    console.log(`   ✅ Auto-approved: $${amount} for ${tool}`);
  });

  client.on('payment:completed', ({ tool, amount, txHash }) => {
    console.log(`   💵 Paid $${amount} for ${tool}`);
  });

  client.on('budget:warning', ({ remaining, threshold }) => {
    console.log(`   ⚠️  Budget warning: $${remaining} remaining`);
  });

  console.log('   Budget: $5.00 per session');
  console.log('   Auto-approve: under $0.10');

  // Step 4: Simulate tool calls
  console.log('\n🔄 Simulating tool calls...\n');
  console.log('-'.repeat(60));

  const toolCalls = [
    { tool: 'health_check', server: 'research-bot', price: '0.00' },
    { tool: 'quick_search', server: 'research-bot', price: '0.005' },
    { tool: 'research', server: 'research-bot', price: '0.01' },
    { tool: 'analysis', server: 'analytics-bot', price: '0.02' },
    { tool: 'deep_research', server: 'research-bot', price: '0.05' },
    { tool: 'quick_search', server: 'research-bot', price: '0.005' },
    { tool: 'report_generation', server: 'research-bot', price: '0.10' },
  ];

  for (const call of toolCalls) {
    console.log(`\n📤 Calling ${call.tool} on ${call.server}...`);
    console.log(`   Price: $${call.price} USDC`);

    // Check safety first
    const safetyCheck = safety.check({
      recipient: '0x' + Math.random().toString(16).slice(2).padStart(40, '0'),
      amount: call.price,
      resource: call.tool,
      timestamp: Date.now(),
    });

    if (!safetyCheck.allowed) {
      console.log(`   ❌ Blocked by safety: ${safetyCheck.reason}`);
      continue;
    }

    // Check if we can pay
    const canPay = await client.canPay(call.price, call.tool, '0x...');

    if (!canPay.allowed) {
      console.log(`   ❌ Cannot pay: ${canPay.reason}`);
      continue;
    }

    if (canPay.requiresApproval) {
      console.log(`   ⏳ Requires approval (over threshold)`);
      // In production, would prompt user
      continue;
    }

    // Simulate tool call result
    const result = await client.callTool({
      tool: call.tool,
      serverUrl: `mcp://${call.server}.local`,
      args: { query: 'test' },
    });

    if (result.error) {
      console.log(`   ❌ Error: ${result.error}`);
    } else {
      console.log(`   ✅ Success!`);
      if (result.payment) {
        console.log(`   💵 Paid: $${result.payment.amount} USDC`);
      }
    }

    // Record for safety tracking
    safety.recordTransaction({
      recipient: '0x...',
      amount: call.price,
      resource: call.tool,
      timestamp: Date.now(),
    }, true);

    // Small delay between calls
    await sleep(100);
  }

  // Step 5: Show spending report
  console.log('\n' + '═'.repeat(60));
  console.log('  SPENDING REPORT');
  console.log('═'.repeat(60));

  const stats = client.getSpendingStats();
  console.log(`\n💰 Session Spent: $${stats.sessionSpent} USDC`);
  console.log(`📊 Remaining Budget: $${stats.remainingBudget} USDC`);
  console.log(`📈 Transactions: ${stats.transactionCount}`);

  console.log('\n📋 By Tool:');
  for (const [tool, amount] of Object.entries(stats.byTool)) {
    console.log(`   ${tool}: $${amount}`);
  }

  // Step 6: Show wallet status
  console.log('\n' + '-'.repeat(60));
  console.log('  WALLET STATUS');
  console.log('-'.repeat(60));

  const walletStats = wallet.stats;
  console.log(`\n💼 Total Spent: $${walletStats.totalSpent}`);
  console.log(`📊 Transaction Count: ${walletStats.transactionCount}`);
  console.log(`💵 Available: $${(parseInt(wallet.balance.available) / 1_000_000).toFixed(2)}`);

  // Step 7: Demonstrate budget exhaustion
  console.log('\n' + '-'.repeat(60));
  console.log('  BUDGET EXHAUSTION DEMO');
  console.log('-'.repeat(60));

  // Try to exceed budget
  console.log('\n📤 Attempting to call expensive tool ($2.00)...');
  const expensiveCheck = await client.canPay('2.00', 'expensive_tool', '0x...');
  console.log(`   Allowed: ${expensiveCheck.allowed}`);
  console.log(`   Reason: ${expensiveCheck.reason || 'N/A'}`);
  console.log(`   Requires Approval: ${expensiveCheck.requiresApproval}`);

  console.log('\n' + '═'.repeat(60));
  console.log('  Agent spending complete! 💰');
  console.log('═'.repeat(60) + '\n');
}

// Helper
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run
main().catch(console.error);
