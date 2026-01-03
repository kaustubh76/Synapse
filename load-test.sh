#!/bin/bash
# Load test script for Synapse API

API_URL="http://localhost:3001"

echo "=== LOAD TEST 3: 5 Concurrent Escrow Creation Requests ==="
for i in 1 2 3 4 5; do
  curl -s -X POST "$API_URL/api/escrow" \
    -H "Content-Type: application/json" \
    -d "{\"intentId\": \"load_test_intent_$i\", \"clientAddress\": \"0x1111111111111111111111111111111111111111\", \"providerAddress\": \"0x2222222222222222222222222222222222222222\", \"amount\": 0.001}" \
    -o /dev/null -w "%{http_code}\n" &
done
wait
echo ""

echo "=== LOAD TEST 4: 5 Concurrent Dispute Creation with Real Oracles ==="
for i in 1 2 3 4 5; do
  curl -s -X POST "$API_URL/api/disputes" \
    -H "Content-Type: application/json" \
    -d "{\"escrowId\": \"load_escrow_$i\", \"intentId\": \"load_intent_$i\", \"clientAddress\": \"0x1111111111111111111111111111111111111111\", \"providerAddress\": \"0x2222222222222222222222222222222222222222\", \"intentType\": \"crypto.price\", \"reason\": \"INCORRECT_DATA\", \"description\": \"Load test dispute $i\", \"providedValue\": {\"symbol\": \"BTC\", \"price\": 85000}, \"params\": {\"symbol\": \"BTC\"}}" \
    -o /dev/null -w "%{http_code}\n" &
done
wait
echo ""

echo "=== LOAD TEST 5: Mixed Concurrent Requests ==="
# 2 escrow config, 2 dispute config, 1 escrow create
curl -s "$API_URL/api/escrow/config" -o /dev/null -w "Escrow Config: %{http_code}\n" &
curl -s "$API_URL/api/disputes/config" -o /dev/null -w "Dispute Config: %{http_code}\n" &
curl -s "$API_URL/api/escrow/config" -o /dev/null -w "Escrow Config: %{http_code}\n" &
curl -s "$API_URL/api/disputes/config" -o /dev/null -w "Dispute Config: %{http_code}\n" &
curl -s -X POST "$API_URL/api/escrow" \
  -H "Content-Type: application/json" \
  -d '{"intentId": "mixed_test_3", "clientAddress": "0x1111111111111111111111111111111111111111", "providerAddress": "0x2222222222222222222222222222222222222222", "amount": 0.001}' \
  -o /dev/null -w "Escrow Create: %{http_code}\n" &
wait
echo ""

echo "=== LOAD TEST COMPLETE ==="
