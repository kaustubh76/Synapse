#!/bin/bash

echo "🧠 Synapse LLM Comparison Demo"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check Available Models
echo -e "${BLUE}📊 Test 1: Available LLM Models${NC}"
curl -s http://localhost:3001/api/llm/models | jq '{
  totalModels: .data.stats.totalModels,
  byProvider: .data.stats.byProvider,
  availableModels: .data.stats.availableModels
}'
echo ""

# Test 2: Check Provider Health
echo -e "${BLUE}🏥 Test 2: Provider Health${NC}"
curl -s http://localhost:3001/api/llm/providers | jq '.data'
echo ""

# Test 3: Create Agent Credit Profile
AGENT_ID="demo_llm_agent_$(date +%s)"
echo -e "${PURPLE}💳 Test 3: Create Agent Credit Profile${NC}"
echo "Agent ID: $AGENT_ID"
curl -s -X POST http://localhost:3001/api/llm/credit/$AGENT_ID/create \
  -H "Content-Type: application/json" \
  -d "{\"address\": \"0xDemo$(openssl rand -hex 4)\"}" | jq '{
    agentId: .data.agentId,
    creditScore: .data.creditScore,
    creditTier: .data.creditTier,
    creditLimit: .data.unsecuredCreditLimit,
    availableCredit: .data.availableCredit,
    discount: .data.tierDiscount
  }'
echo ""

# Test 4: LLM Comparison (will show 0 models since no API keys)
echo -e "${YELLOW}⚡ Test 4: LLM Comparison Request${NC}"
echo "Note: No models available without API keys, but showing the request structure"
curl -s -X POST http://localhost:3001/api/llm/compare \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain quantum computing in simple terms",
    "modelTier": "balanced",
    "compareBy": ["cost", "quality", "latency"],
    "agentId": "'$AGENT_ID'",
    "maxTokens": 500
  }' | jq '.'
echo ""

# Test 5: Check Updated Credit Profile
echo -e "${GREEN}📈 Test 5: Check Updated Credit Profile${NC}"
curl -s http://localhost:3001/api/llm/credit/$AGENT_ID | jq '{
  agentId: .data.agentId,
  creditScore: .data.creditScore,
  creditTier: .data.creditTier,
  availableCredit: .data.availableCredit,
  totalApiCalls: .data.factors.totalApiCalls,
  totalSpent: .data.factors.totalSpent
}'
echo ""

# Test 6: Streaming Payment Demo
echo -e "${PURPLE}💸 Test 6: Create Streaming Payment${NC}"
curl -s -X POST http://localhost:3001/api/llm/stream/create \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "'$AGENT_ID'",
    "modelId": "gpt-4-turbo",
    "maxAmount": 1.0,
    "costPerToken": 0.00003
  }' | jq '{
    streamId: .data.streamId,
    status: .data.status,
    maxAmount: .data.maxAmount,
    costPerToken: .data.costPerToken
  }'
echo ""

echo "================================"
echo -e "${GREEN}✨ Demo Complete!${NC}"
echo ""
echo "📖 What's Available:"
echo "   • Multi-LLM comparison engine (20+ models across 6 providers)"
echo "   • FICO-style credit scoring (300-850)"
echo "   • Streaming micropayments (token-by-token)"
echo "   • MCP monetization SDK"
echo ""
echo "🔑 To enable real LLM comparisons:"
echo "   1. Add API keys to apps/api/.env:"
echo "      OPENAI_API_KEY=sk-..."
echo "      ANTHROPIC_API_KEY=sk-ant-..."
echo "      GOOGLE_API_KEY=..."
echo "   2. Restart the API server"
echo "   3. Visit http://localhost:3002/llm for the visual comparison UI"
echo ""
echo "🌐 Running Services:"
echo "   • API Server: http://localhost:3001"
echo "   • Web UI: http://localhost:3002"
echo "   • Intent Network: http://localhost:3002"
echo "   • LLM Comparison: http://localhost:3002/llm"
echo ""
