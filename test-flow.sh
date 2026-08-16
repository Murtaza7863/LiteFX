#!/bin/bash
set -euo pipefail
BASE=http://localhost:3001/api
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"; kill $BACKEND_PID 2>/dev/null || true' EXIT

echo "=== Starting backend ==="
cd backend && npx tsx src/index.ts &
BACKEND_PID=$!
for _ in 1 2 3 4 5 6 7 8; do
  if curl -sf "$BASE/health" >/dev/null; then
    break
  fi
  sleep 0.5
done

echo ""
echo "=== 0. Health ==="
curl -sf "$BASE/health" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['ok']"

echo ""
echo "=== 1. Sign up ==="
curl -sf -c "$COOKIE_JAR" -b "$COOKIE_JAR" -H "Content-Type: application/json" -H "X-LiteFX-Request: 1" \
  -X POST "$BASE/auth/signup" \
  -d '{"name":"Ada","email":"ada@litefx.test","password":"correcthorse1"}' >/dev/null

echo ""
echo "=== 2. Load sample trip ==="
curl -sf -c "$COOKIE_JAR" -b "$COOKIE_JAR" -H "X-LiteFX-Request: 1" -X POST "$BASE/seed" >/dev/null

echo ""
echo "=== 3. Get scenario ==="
curl -sf -c "$COOKIE_JAR" -b "$COOKIE_JAR" "$BASE/scenario" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Entities: {len(d[\"entities\"])}, Expenses: {len(d[\"expenses\"])}, DebtEdges: {len(d[\"debtEdges\"])}')
assert len(d['entities']) == 6
"

echo ""
echo "=== 4. Run engine (net + route) ==="
curl -sf -c "$COOKIE_JAR" -b "$COOKIE_JAR" -H "X-LiteFX-Request: 1" -X POST "$BASE/engine/run" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Raw: {d[\"rawEdgeCount\"]} -> Net: {d[\"netEdgeCount\"]} (ratio {d[\"reductionRatio\"]}:1)')
print(f'Corridor savings vs Splitwise: \${d.get(\"corridorSavingsUsd\", 0):.2f}')
print(f'Rail types: {d[\"railTypesExercised\"]}')
rails = set(o.get('chosenRail') for o in d['obligations'])
assert 'claim_link' in rails, 'expected a claim_link obligation for Eve'
assert 'local' in rails, 'expected a local TH→TH rail'
"

echo ""
echo "=== 5. Find and settle claim_link obligation ==="
CLAIM_ID=$(curl -sf -c "$COOKIE_JAR" -b "$COOKIE_JAR" "$BASE/scenario" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for o in d['netObligations']:
    if o.get('chosenRail') == 'claim_link':
        print(o['id'])
        break
")
echo "Claim obligation: $CLAIM_ID"
curl -sf -c "$COOKIE_JAR" -b "$COOKIE_JAR" -H "X-LiteFX-Request: 1" \
  -X POST "$BASE/settlement/$CLAIM_ID/settle" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Success: {d[\"success\"]} - {d[\"message\"]}')
assert d['success']
assert d.get('link', {}).get('token'), 'settle should return the claim link'
"

echo ""
echo "=== 6. Get claim token ==="
TOKEN=$(curl -sf -c "$COOKIE_JAR" -b "$COOKIE_JAR" "$BASE/scenario" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for o in d['netObligations']:
    if o.get('claimToken'):
        print(o['claimToken'])
        break
")
echo "Token: ${TOKEN:0:25}..."

echo ""
echo "=== 7. Open claim link (no session) ==="
curl -sf "$BASE/claim/$TOKEN" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Recipient: {d[\"recipient\"][\"name\"]}')
print(f'Amount: {d[\"obligation\"][\"amountUsd\"]:.2f} USD')
print(f'Payout options: {len(d[\"payoutOptions\"])}')
print(f'Status: {d[\"link\"][\"status\"]}')
"

echo ""
echo "=== 8. Claim with payout method ==="
curl -sf -H "Content-Type: application/json" \
  -X POST "$BASE/claim/$TOKEN/claim" \
  -d '{"payoutMethod": "GrabPay"}' | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Success: {d[\"success\"]}')
print(f'Message: {d[\"message\"]}')
print(f'Link status: {d[\"link\"][\"status\"]}')
print(f'Payout method: {d[\"link\"][\"payoutMethod\"]}')
assert d['success']
"

echo ""
echo "=== ALL TESTS PASSED ==="
