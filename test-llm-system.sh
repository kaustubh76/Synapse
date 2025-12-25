#!/bin/bash

echo "🧪 Testing Synapse LLM System"
echo "================================"
echo ""

# Test 1: Health Check
echo "✅ Test 1: Health Check"
curl -s http://localhost:3001/health | jq '.'
echo ""

# Test 2: List Available Models
echo "📊 Test 2: Available Models"
curl -s http://localhost:3001/api/llm/models | jq '.data.stats'
echo ""

# Test 3: Create Credit Profile
echo "💳 Test 3: Create Credit Profile"
curl -s -X POST http://localhost:3001/api/llm/credit/demo_agent/create \
  -H "Content-Type: application/json" \
  -d '{"address": "0xDemoWallet123"}' | jq '{
    success,
    creditScore: .data.creditScore,
    creditTier: .data.creditTier,
    creditLimit: .data.unsecuredCreditLimit,
    availableCredit: .data.availableCredit,
    discount: .data.tierDiscount
  }'
echo ""

# Test 4: Get Credit Profile
echo "📈 Test 4: Get Credit Profile"
curl -s http://localhost:3001/api/llm/credit/demo_agent | jq '{
    agentId: .data.agentId,
    score: .data.creditScore,
    tier: .data.creditTier,
    limit: .data.unsecuredCreditLimit,
    factors: .data.factors
  }'
echo ""

# Test 5: Check Providers
echo "🤖 Test 5: Provider Health"
curl -s http://localhost:3001/api/llm/providers | jq '.data'
echo ""

# Test 6: Network Stats
echo "📡 Test 6: Network Statistics"
curl -s http://localhost:3001/api/network/stats | jq '.data | {
    providersOnline,
    providersTotal,
    intentsPending,
    intentsCompleted,
    avgResponseTime,
    successRate
  }'
echo ""

echo "================================"
echo "✨ All tests complete!"
echo ""
echo "🌐 Server running at: http://localhost:3001"
echo "📚 View docs at: /Users/apple/Desktop/Synapse/docs/"
echo ""
