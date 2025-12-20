#!/usr/bin/env npx ts-node
// ============================================================
// End-to-End Test for Synapse Network
// Tests the full intent lifecycle with provider bots
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
const API_URL = process.env.SYNAPSE_API_URL || 'http://localhost:3001';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  data?: any;
}

// Helper to parse JSON with type assertion
async function parseJson<T = any>(response: Response): Promise<T> {
  return await response.json() as T;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testHealthCheck(): Promise<TestResult> {
  const start = Date.now();
  try {
    const response = await fetch(`${API_URL}/health`);
    const data = await parseJson<any>(response);

    return {
      name: 'Health Check',
      passed: data.status === 'healthy',
      duration: Date.now() - start,
      data
    };
  } catch (error) {
    return {
      name: 'Health Check',
      passed: false,
      duration: Date.now() - start,
      error: String(error)
    };
  }
}

async function testProviderList(): Promise<TestResult> {
  const start = Date.now();
  try {
    const response = await fetch(`${API_URL}/api/providers`);
    const data = await parseJson<any>(response);

    const providerCount = data.data?.length || 0;
    const onlineProviders = data.data?.filter((p: any) => p.status === 'ONLINE').length || 0;

    return {
      name: 'Provider List',
      passed: data.success && providerCount > 0,
      duration: Date.now() - start,
      data: { total: providerCount, online: onlineProviders }
    };
  } catch (error) {
    return {
      name: 'Provider List',
      passed: false,
      duration: Date.now() - start,
      error: String(error)
    };
  }
}

async function testWeatherIntent(): Promise<TestResult> {
  const start = Date.now();
  try {
    // Create weather intent
    const createResponse = await fetch(`${API_URL}/api/intents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'weather.current',
        category: 'data',
        params: { city: 'San Francisco' },
        maxBudget: 0.02,
        clientAddress: '0xTestClient_E2E'
      })
    });

    const createData = await parseJson<any>(createResponse);
    if (!createData.success) {
      return {
        name: 'Weather Intent',
        passed: false,
        duration: Date.now() - start,
        error: createData.error?.message
      };
    }

    const intentId = createData.data.id;
    console.log(`   Created intent: ${intentId}`);

    // Wait for bidding and execution (max 10 seconds)
    let intent;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      const statusResponse = await fetch(`${API_URL}/api/intents/${intentId}`);
      const statusData = await parseJson<any>(statusResponse);
      intent = statusData.data?.intent;

      if (intent?.status === 'COMPLETED') {
        return {
          name: 'Weather Intent',
          passed: true,
          duration: Date.now() - start,
          data: {
            intentId,
            status: intent.status,
            result: intent.result,
            bids: statusData.data?.bids?.length || 0
          }
        };
      }

      if (intent?.status === 'FAILED') {
        return {
          name: 'Weather Intent',
          passed: false,
          duration: Date.now() - start,
          error: 'Intent failed',
          data: { status: intent.status }
        };
      }
    }

    return {
      name: 'Weather Intent',
      passed: false,
      duration: Date.now() - start,
      error: `Timeout waiting for completion (status: ${intent?.status})`,
      data: { intentId, status: intent?.status }
    };
  } catch (error) {
    return {
      name: 'Weather Intent',
      passed: false,
      duration: Date.now() - start,
      error: String(error)
    };
  }
}

async function testCryptoIntent(): Promise<TestResult> {
  const start = Date.now();
  try {
    const createResponse = await fetch(`${API_URL}/api/intents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'crypto.price',
        category: 'data',
        params: { symbol: 'BTC' },
        maxBudget: 0.015,
        clientAddress: '0xTestClient_E2E'
      })
    });

    const createData = await parseJson<any>(createResponse);
    if (!createData.success) {
      return {
        name: 'Crypto Intent',
        passed: false,
        duration: Date.now() - start,
        error: createData.error?.message
      };
    }

    const intentId = createData.data.id;
    console.log(`   Created intent: ${intentId}`);

    let intent;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      const statusResponse = await fetch(`${API_URL}/api/intents/${intentId}`);
      const statusData = await parseJson<any>(statusResponse);
      intent = statusData.data?.intent;

      if (intent?.status === 'COMPLETED') {
        return {
          name: 'Crypto Intent',
          passed: true,
          duration: Date.now() - start,
          data: {
            intentId,
            status: intent.status,
            result: intent.result
          }
        };
      }

      if (intent?.status === 'FAILED') {
        return {
          name: 'Crypto Intent',
          passed: false,
          duration: Date.now() - start,
          error: 'Intent failed'
        };
      }
    }

    return {
      name: 'Crypto Intent',
      passed: false,
      duration: Date.now() - start,
      error: `Timeout (status: ${intent?.status})`
    };
  } catch (error) {
    return {
      name: 'Crypto Intent',
      passed: false,
      duration: Date.now() - start,
      error: String(error)
    };
  }
}

async function testNewsIntent(): Promise<TestResult> {
  const start = Date.now();
  try {
    const createResponse = await fetch(`${API_URL}/api/intents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'news.latest',
        category: 'data',
        params: { topic: 'technology', count: 5 },
        maxBudget: 0.025,
        clientAddress: '0xTestClient_E2E'
      })
    });

    const createData = await parseJson<any>(createResponse);
    if (!createData.success) {
      return {
        name: 'News Intent',
        passed: false,
        duration: Date.now() - start,
        error: createData.error?.message
      };
    }

    const intentId = createData.data.id;
    console.log(`   Created intent: ${intentId}`);

    let intent;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      const statusResponse = await fetch(`${API_URL}/api/intents/${intentId}`);
      const statusData = await parseJson<any>(statusResponse);
      intent = statusData.data?.intent;

      if (intent?.status === 'COMPLETED') {
        return {
          name: 'News Intent',
          passed: true,
          duration: Date.now() - start,
          data: { intentId, status: intent.status }
        };
      }

      if (intent?.status === 'FAILED') {
        return {
          name: 'News Intent',
          passed: false,
          duration: Date.now() - start,
          error: 'Intent failed'
        };
      }
    }

    return {
      name: 'News Intent',
      passed: false,
      duration: Date.now() - start,
      error: `Timeout (status: ${intent?.status})`
    };
  } catch (error) {
    return {
      name: 'News Intent',
      passed: false,
      duration: Date.now() - start,
      error: String(error)
    };
  }
}

async function testEscrowFlow(): Promise<TestResult> {
  const start = Date.now();
  try {
    // Create escrow
    const createResponse = await fetch(`${API_URL}/api/escrow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intentId: `test_intent_${Date.now()}`,
        clientAddress: '0xTestClient_E2E',
        amount: 0.05
      })
    });

    const createData = await parseJson<any>(createResponse);
    if (!createData.success) {
      return {
        name: 'Escrow Flow',
        passed: false,
        duration: Date.now() - start,
        error: createData.error?.message
      };
    }

    const escrowId = createData.data.id;

    // Release escrow
    const releaseResponse = await fetch(`${API_URL}/api/escrow/${escrowId}/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipientAddress: '0xTestProvider_E2E',
        amount: 0.04
      })
    });

    const releaseData = await parseJson<any>(releaseResponse);

    return {
      name: 'Escrow Flow',
      passed: releaseData.success,
      duration: Date.now() - start,
      data: {
        escrowId,
        released: releaseData.data?.amount,
        refund: releaseData.data?.refundAmount
      }
    };
  } catch (error) {
    return {
      name: 'Escrow Flow',
      passed: false,
      duration: Date.now() - start,
      error: String(error)
    };
  }
}

async function testAgentRegistration(): Promise<TestResult> {
  const start = Date.now();
  try {
    const response = await fetch(`${API_URL}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `TestAgent_${Date.now()}`,
        description: 'End-to-end test agent',
        capabilities: ['test.capability'],
        walletAddress: `0xTestWallet_${Date.now()}`,
        initialStake: 50
      })
    });

    const data = await parseJson<any>(response);

    return {
      name: 'Agent Registration',
      passed: data.success,
      duration: Date.now() - start,
      data: data.success ? {
        agentId: data.data.agentId,
        stake: data.data.stakedAmount
      } : undefined,
      error: data.error?.message
    };
  } catch (error) {
    return {
      name: 'Agent Registration',
      passed: false,
      duration: Date.now() - start,
      error: String(error)
    };
  }
}

async function runTests(): Promise<void> {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║   🧪 SYNAPSE END-TO-END TESTS                              ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📡 Testing against: ${API_URL}`);
  console.log('');

  const results: TestResult[] = [];

  // Run tests
  const tests = [
    { name: '1. Health Check', fn: testHealthCheck },
    { name: '2. Provider List', fn: testProviderList },
    { name: '3. Agent Registration', fn: testAgentRegistration },
    { name: '4. Escrow Flow', fn: testEscrowFlow },
    { name: '5. Weather Intent (E2E)', fn: testWeatherIntent },
    { name: '6. Crypto Intent (E2E)', fn: testCryptoIntent },
    { name: '7. News Intent (E2E)', fn: testNewsIntent }
  ];

  for (const test of tests) {
    console.log(`🔄 Running: ${test.name}`);
    const result = await test.fn();
    results.push(result);

    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.name}: ${result.passed ? 'PASSED' : 'FAILED'} (${result.duration}ms)`);

    if (result.data) {
      console.log(`   Data: ${JSON.stringify(result.data).substring(0, 100)}`);
    }
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    console.log('');
  }

  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  console.log('════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  console.log(`⏱️  Total time: ${totalTime}ms`);
  console.log('');

  if (failed > 0) {
    console.log('❌ Some tests failed!');
    console.log('');
    console.log('   Make sure:');
    console.log('   1. API server is running (npm run dev --workspace=@synapse/api)');
    console.log('   2. Provider bots are running (npx ts-node bots/run-all-bots.ts)');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!');
    console.log('');
  }
}

runTests().catch(console.error);
