# Synapse Testing Guide

Complete end-to-end testing guide for the Synapse Intent Network platform.

---

## Prerequisites

### Environment Setup

1. **Install Dependencies**
```bash
# Install all packages
npm install

# Build core package
cd packages/core && npm run build && cd ../..
```

2. **Environment Variables**

Create `.env.local` in `apps/api`:
```env
# Crossmint Wallet API
CROSSMINT_API_KEY=your_api_key_here

# Base Sepolia RPC
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# USDC Contract on Base Sepolia
USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# API Configuration
PORT=3001
NODE_ENV=development
```

Create `.env.local` in `apps/web`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

---

## Test Scenarios

### 1. Basic Connectivity Tests

#### 1.1 API Server Health Check
```bash
# Start API server
cd apps/api
npm run dev

# In another terminal, test health endpoint
curl http://localhost:3001/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": 1234567890,
  "uptime": 123.45
}
```

#### 1.2 WebSocket Connection
```bash
# Start web app
cd apps/web
npm run dev

# Open browser to http://localhost:3000/dashboard
# Check browser console for: "Connected to Synapse Intent Network"
```

**Expected Console Output:**
```
[WebSocket] Connected to ws://localhost:3001
[WebSocket] Connection state: connected
```

---

### 2. Wallet Integration Tests

#### 2.1 Demo Mode Fallback
**Steps:**
1. Navigate to `http://localhost:3000`
2. Click "Connect Wallet"
3. If Crossmint API is unavailable, verify demo mode activates

**Expected Behavior:**
- Yellow warning badge appears
- "Demo Mode Active" notification
- Shows reason: "Wallet API is unavailable"
- "Try Real Wallet" button available

#### 2.2 Real Wallet Connection
**Steps:**
1. Ensure `CROSSMINT_API_KEY` is set
2. Click "Connect Wallet"
3. Verify wallet connection succeeds

**Expected Behavior:**
- Wallet address displayed
- Balance shows real USDC amount
- Green checkmark indicator
- BaseScan link available

#### 2.3 Wallet Error Recovery
**Steps:**
1. Disconnect network temporarily
2. Click "Connect Wallet"
3. Click "Try Real Wallet" after error

**Expected Behavior:**
- Demo mode activates on error
- Clear error message displayed
- Retry button functional
- Automatic retry on reconnect

---

### 3. Intent Auction System Tests

#### 3.1 Create Intent
**Test via API:**
```bash
curl -X POST http://localhost:3001/api/intents \
  -H "Content-Type: application/json" \
  -d '{
    "type": "data.fetch",
    "category": "web",
    "params": {
      "url": "https://api.example.com/data",
      "method": "GET"
    },
    "maxBudget": 0.5,
    "currency": "USDC",
    "requirements": {
      "minReputation": 0,
      "requireTEE": false
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "int_xxxxxxxxxxxxx",
    "status": "OPEN",
    "biddingDeadline": 1234567890,
    "executionDeadline": 1234567890
  }
}
```

**Verify:**
- [ ] Intent appears in dashboard
- [ ] WebSocket broadcasts "intent_created"
- [ ] Bidding timer starts
- [ ] Providers receive notification

#### 3.2 Submit Bids
**Prerequisites:** Have at least 2 provider bots registered

**Test via API:**
```bash
curl -X POST http://localhost:3001/api/bids \
  -H "Content-Type: application/json" \
  -d '{
    "intentId": "int_xxxxxxxxxxxxx",
    "providerId": "provider_1",
    "bidAmount": 0.3,
    "estimatedTime": 500,
    "confidence": 0.95
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "bid_xxxxxxxxxxxx",
    "rank": 1,
    "calculatedScore": 87.5,
    "status": "PENDING"
  }
}
```

**Verify:**
- [ ] Bid appears in dashboard
- [ ] WebSocket broadcasts "bid_received"
- [ ] Bids ranked by score
- [ ] Dashboard updates in real-time

#### 3.3 Winner Selection
**Wait for bidding deadline or force close:**
```bash
curl -X POST http://localhost:3001/api/intents/int_xxxxxxxxxxxxx/close-bidding
```

**Verify:**
- [ ] WebSocket broadcasts "winner_selected"
- [ ] Intent status changes to "ASSIGNED"
- [ ] Winning bid status changes to "ACCEPTED"
- [ ] Failover queue populated
- [ ] Dashboard shows winner

#### 3.4 Intent Execution
**Simulate provider completing the intent:**
```bash
curl -X POST http://localhost:3001/api/intents/int_xxxxxxxxxxxxx/result \
  -H "Content-Type: application/json" \
  -d '{
    "providerId": "provider_1",
    "success": true,
    "data": {
      "result": "Task completed successfully"
    },
    "executionTime": 450
  }'
```

**Verify:**
- [ ] WebSocket broadcasts "intent_completed"
- [ ] Intent status changes to "COMPLETED"
- [ ] Winning bid status changes to "EXECUTED"
- [ ] Result stored correctly
- [ ] Dashboard updates

#### 3.5 Failover Mechanism
**Simulate provider failure:**
```bash
curl -X POST http://localhost:3001/api/intents/int_xxxxxxxxxxxxx/failover
```

**Verify:**
- [ ] WebSocket broadcasts "failover_triggered"
- [ ] Next provider in queue assigned
- [ ] Failed provider's bid marked "FAILED"
- [ ] New execution timer starts
- [ ] Dashboard shows failover event

---

### 4. x402 Payment Integration Tests

#### 4.1 Payment Settlement
**After intent completion:**
```bash
curl -X POST http://localhost:3001/api/payments/settle \
  -H "Content-Type: application/json" \
  -d '{
    "intentId": "int_xxxxxxxxxxxxx",
    "provider": "0x1234...5678",
    "amount": 0.3,
    "currency": "USDC"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "txHash": "0xabcd...ef01",
    "amount": 0.3,
    "status": "confirmed"
  }
}
```

**Verify:**
- [ ] Transaction appears on BaseScan
- [ ] WebSocket broadcasts "payment_settled"
- [ ] Provider balance increases
- [ ] Client balance decreases
- [ ] Transaction status component shows "confirmed"

#### 4.2 Payment Streaming
**Test micropayments:**
```bash
# Simulate streaming payment (10 chunks of 0.01 USDC)
for i in {1..10}; do
  curl -X POST http://localhost:3001/api/payments/stream \
    -H "Content-Type: application/json" \
    -d "{
      \"intentId\": \"int_xxxxxxxxxxxxx\",
      \"provider\": \"0x1234...5678\",
      \"amount\": 0.01,
      \"chunkNumber\": $i
    }"
  sleep 1
done
```

**Verify:**
- [ ] Each chunk creates a transaction
- [ ] UI shows progressive payment
- [ ] Total adds up correctly
- [ ] No double-spending
- [ ] All transactions confirmed

---

### 5. Credit Scoring System Tests

#### 5.1 Initial Score
**Get agent profile:**
```bash
curl http://localhost:3001/api/credit/agent/0x1234...5678
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "agentAddress": "0x1234...5678",
    "creditScore": 300,
    "tier": "POOR",
    "totalPayments": 0,
    "onTimePayments": 0
  }
}
```

#### 5.2 Record Payment
```bash
curl -X POST http://localhost:3001/api/credit/payment \
  -H "Content-Type: application/json" \
  -d '{
    "agentAddress": "0x1234...5678",
    "amount": 1.5,
    "intentId": "int_xxxxxxxxxxxxx",
    "onTime": true
  }'
```

**Verify:**
- [ ] Credit score increases
- [ ] Payment history updated
- [ ] Score between 300-850
- [ ] Tier updates appropriately

#### 5.3 Anti-Gaming Rules
**Test rapid payments:**
```bash
# Try submitting 15 payments within 1 minute
for i in {1..15}; do
  curl -X POST http://localhost:3001/api/credit/payment \
    -H "Content-Type: application/json" \
    -d "{
      \"agentAddress\": \"0x1234...5678\",
      \"amount\": 0.01,
      \"intentId\": \"int_test_$i\",
      \"onTime\": true
    }"
  sleep 2
done
```

**Verify:**
- [ ] Rate limiting kicks in after 10 payments/hour
- [ ] Small payments have reduced impact
- [ ] Velocity penalty applied
- [ ] Anti-gaming info returned
- [ ] Score increase capped at 15 points

#### 5.4 Credit Score Persistence
**Restart server:**
```bash
# Stop server (Ctrl+C)
# Start server again
npm run dev

# Check if credit score persisted
curl http://localhost:3001/api/credit/agent/0x1234...5678
```

**Verify:**
- [ ] Credit score unchanged
- [ ] Payment history intact
- [ ] Checksum validates
- [ ] Backup file created

---

### 6. DeFi Protocol Tests

#### 6.1 Flash Loan
```bash
curl -X POST http://localhost:3001/api/defi/flash-loan \
  -H "Content-Type: application/json" \
  -d '{
    "token": "USDC",
    "amount": 1000,
    "borrower": "0x1234...5678",
    "callback": "executeArbitrage"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "borrowed": 1000,
    "fee": 3,
    "profit": 5.5,
    "txHash": "0xabcd...ef01"
  }
}
```

**Verify:**
- [ ] Loan borrowed atomically
- [ ] Callback executed
- [ ] Loan + fee repaid
- [ ] Profit calculated correctly
- [ ] Transaction reverts if unprofitable

#### 6.2 Concurrent Flash Loans
**Test race condition fix:**
```bash
# Submit 5 concurrent flash loan requests
for i in {1..5}; do
  curl -X POST http://localhost:3001/api/defi/flash-loan \
    -H "Content-Type: application/json" \
    -d "{
      \"token\": \"USDC\",
      \"amount\": 200,
      \"borrower\": \"0x1234...567$i\"
    }" &
done
wait
```

**Verify:**
- [ ] No double-spending
- [ ] Lock queue processes sequentially
- [ ] All requests succeed or fail gracefully
- [ ] Reserved amounts tracked correctly
- [ ] No race conditions

#### 6.3 Staking
```bash
curl -X POST http://localhost:3001/api/defi/stake \
  -H "Content-Type: application/json" \
  -d '{
    "token": "USDC",
    "amount": 100,
    "staker": "0x1234...5678",
    "duration": 2592000
  }'
```

**Verify:**
- [ ] Stake recorded
- [ ] APY calculated
- [ ] Lock period enforced
- [ ] Rewards accruing
- [ ] Early withdrawal penalty applied

---

### 7. Mobile Responsiveness Tests

#### 7.1 Mobile Navigation
**Device: iPhone 12 (375px width)**

**Steps:**
1. Open in mobile viewport
2. Check hamburger menu appears
3. Click menu button
4. Verify slide-out drawer

**Verify:**
- [ ] Hamburger icon visible
- [ ] Desktop nav hidden
- [ ] Drawer slides in smoothly
- [ ] All routes accessible
- [ ] Close on backdrop click

#### 7.2 Component Scaling
**Test at breakpoints: 375px, 640px, 768px, 1024px**

**Verify:**
- [ ] Header scales properly
- [ ] Wallet button compact on mobile
- [ ] Dashboard grid: 1→2→3 columns
- [ ] Provider cards readable
- [ ] No horizontal scroll
- [ ] Touch targets ≥44px

#### 7.3 Touch Interactions
**On tablet/mobile:**
- [ ] Swipe to close mobile nav
- [ ] Tap wallet dropdown
- [ ] Scroll activity feed
- [ ] Filter capabilities
- [ ] Refresh button responsive

---

### 8. Performance Tests

#### 8.1 WebSocket Message Batching
**Monitor in browser console:**
```javascript
// Count messages received
let messageCount = 0;
socket.on('*', () => messageCount++);

// After 10 seconds
setTimeout(() => console.log('Messages:', messageCount), 10000);
```

**Expected:**
- With batching: ~50-100 messages/10s
- Without batching: ~1000+ messages/10s

**Verify:**
- [ ] Messages batched every 100ms
- [ ] Batch sizes ≤50 messages
- [ ] High-priority messages sent immediately
- [ ] Low-priority messages dropped under backpressure

#### 8.2 API Caching
**Test cache effectiveness:**
```bash
# First request (cache miss)
time curl http://localhost:3001/api/providers

# Second request within 5s (cache hit)
time curl http://localhost:3001/api/providers
```

**Expected:**
- First request: ~50-200ms
- Cached request: ~5-10ms

**Verify:**
- [ ] Second request 10-40x faster
- [ ] Cache expires after TTL
- [ ] Different endpoints cached separately
- [ ] Cache invalidates on updates

#### 8.3 Memory Management
**Monitor over 1 hour:**
```bash
# Start server and monitor memory
while true; do
  ps aux | grep node | grep -v grep
  sleep 60
done
```

**Verify:**
- [ ] Memory stays bounded
- [ ] Old intents cleaned up (1hr retention)
- [ ] Cleanup runs every 5 minutes
- [ ] No memory leaks
- [ ] Process doesn't grow indefinitely

---

### 9. Error Handling Tests

#### 9.1 Network Interruption
**Steps:**
1. Disconnect network
2. Wait 30 seconds
3. Reconnect network

**Verify:**
- [ ] WebSocket reconnects automatically
- [ ] Exponential backoff applied
- [ ] Subscriptions restored
- [ ] UI shows "reconnecting" state
- [ ] Data syncs after reconnect

#### 9.2 Server Crash Recovery
**Steps:**
1. Kill API server
2. Observe client behavior
3. Restart server

**Verify:**
- [ ] Client shows "Offline" badge
- [ ] Error boundary catches errors
- [ ] Toast shows connection error
- [ ] Client reconnects when server returns
- [ ] State recovers correctly

#### 9.3 Invalid Data
**Test with malformed requests:**
```bash
curl -X POST http://localhost:3001/api/intents \
  -H "Content-Type: application/json" \
  -d '{
    "type": "",
    "maxBudget": -5,
    "invalid": "field"
  }'
```

**Verify:**
- [ ] Returns 400 Bad Request
- [ ] Clear error message
- [ ] No server crash
- [ ] Validation errors detailed
- [ ] Client handles gracefully

---

### 10. Integration Tests

#### 10.1 Full Intent Lifecycle
**Complete flow:**
1. Create intent
2. Multiple providers bid
3. Winner selected
4. Provider executes
5. Result submitted
6. Payment settled
7. Credit score updated

**Verify all stages:**
- [ ] Intent progresses through all statuses
- [ ] WebSocket broadcasts all events
- [ ] Dashboard updates in real-time
- [ ] Payment processes correctly
- [ ] Credit score increases
- [ ] All data persists

#### 10.2 Multi-User Scenario
**Simulate:**
- 3 clients creating intents
- 5 providers bidding
- Concurrent executions

**Verify:**
- [ ] No conflicts
- [ ] Correct winner selection
- [ ] Failover works
- [ ] All payments settle
- [ ] Performance acceptable

---

## Automated Test Scripts

### Quick Health Check
```bash
#!/bin/bash
# test-health.sh

echo "Testing API health..."
curl -f http://localhost:3001/health || exit 1

echo "Testing WebSocket..."
curl -f http://localhost:3001/socket.io/ || exit 1

echo "All health checks passed!"
```

### Intent Flow Test
```bash
#!/bin/bash
# test-intent-flow.sh

# Create intent
INTENT=$(curl -s -X POST http://localhost:3001/api/intents \
  -H "Content-Type: application/json" \
  -d '{"type":"test","maxBudget":1}' | jq -r '.data.id')

echo "Created intent: $INTENT"

# Submit bid
curl -s -X POST http://localhost:3001/api/bids \
  -H "Content-Type: application/json" \
  -d "{\"intentId\":\"$INTENT\",\"bidAmount\":0.5}"

echo "Bid submitted"

# Force close bidding
sleep 2
curl -s -X POST "http://localhost:3001/api/intents/$INTENT/close-bidding"

echo "Intent flow test completed!"
```

---

## Troubleshooting

### Common Issues

#### 1. WebSocket Connection Fails
```
Error: WebSocket connection to 'ws://localhost:3001' failed
```

**Solutions:**
- Check API server is running
- Verify port 3001 is not blocked
- Check CORS configuration
- Clear browser cache

#### 2. Wallet Connection Fails
```
Error: Wallet API is unavailable
```

**Solutions:**
- Verify `CROSSMINT_API_KEY` is set
- Check API key is valid
- Ensure network connectivity
- Use demo mode for testing

#### 3. Credit Score Not Persisting
```
Error: ENOENT: no such file or directory
```

**Solutions:**
- Create `./data` directory
- Check file permissions
- Verify disk space
- Check logs for errors

#### 4. Cache Not Working
```
All requests taking full time
```

**Solutions:**
- Verify cache middleware applied
- Check Redis connection (if external)
- Monitor memory usage
- Check TTL configuration

---

## Monitoring & Metrics

### Key Metrics to Track

1. **WebSocket Stats**
```javascript
io.getWSStats()
// Returns: connections, messages, dropped, avgBatchSize
```

2. **Intent Engine Stats**
```javascript
intentEngine.getStats()
// Returns: intents created/completed/failed, cleanup runs
```

3. **Memory Usage**
```javascript
intentEngine.getMemoryUsage()
// Returns: intents, bids, timers
```

4. **Cache Stats**
```javascript
cache.getStats()
// Returns: hits, misses, hit rate
```

---

## Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] Environment variables set
- [ ] Database migrations run
- [ ] CORS origins configured
- [ ] SSL certificates installed

### Post-Deployment
- [ ] Health check endpoints responding
- [ ] WebSocket connections working
- [ ] Wallet integration functional
- [ ] Monitoring active
- [ ] Error tracking configured
- [ ] Backup system verified
- [ ] Load testing completed

---

## Contact & Support

For issues or questions:
- GitHub: https://github.com/kaushtubh/synapse/issues
- Documentation: See IMPROVEMENTS_SUMMARY.md

**Happy Testing! 🚀**
