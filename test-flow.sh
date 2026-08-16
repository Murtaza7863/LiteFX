#!/bin/bash
set -e
BASE=http://localhost:3001/api

echo "=== Starting backend ==="
cd backend && npx tsx src/index.ts &
BACKEND_PID=$!
sleep 2

cleanup() { kill $BACKEND_PID 2>/dev/null || true; }
trap cleanup EXIT

echo ""
echo "=== 0. Load sample trip ==="
curl -s -X POST $BASE/seed >/dev/null

echo ""
echo "=== 1. Get scenario ==="
curl -s $BASE/scenario | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Entities: {len(d[\"entities\"])}, Expenses: {len(d[\"expenses\"])}, DebtEdges: {len(d[\"debtEdges\"])}')
"

echo ""
echo "=== 2. Run engine (net + route) ==="
curl -s -X POST $BASE/engine/run | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Raw: {d[\"rawEdgeCount\"]} -> Net: {d[\"netEdgeCount\"]} (ratio {d[\"reductionRatio\"]}:1)')
print(f'Corridor savings vs Splitwise: \${d.get(\"corridorSavingsUsd\", 0):.2f}')
print(f'Rail types: {d[\"railTypesExercised\"]}')
for o in d['obligations']:
    print(f'  {o[\"id\"]}: {o[\"from\"]}->{o[\"to\"]} rail={o.get(\"chosenRail\",\"?\")} {o[\"amountUsd\"]:.2f}USD')
rails = set(o.get('chosenRail') for o in d['obligations'])
assert 'claim_link' in rails, 'expected a claim_link obligation for Eve'
assert 'local' in rails, 'expected a local TH→TH rail'
"

echo ""
echo "=== 3. Find and settle claim_link obligation ==="
CLAIM_ID=$(curl -s $BASE/scenario | python3 -c "
import sys,json
d=json.load(sys.stdin)
for o in d['netObligations']:
    if o.get('chosenRail') == 'claim_link':
        print(o['id'])
        break
")
echo "Claim obligation: $CLAIM_ID"
curl -s -X POST $BASE/settlement/$CLAIM_ID/settle | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Success: {d[\"success\"]} - {d[\"message\"]}')
assert d['success']
assert d.get('link', {}).get('token'), 'settle should return the claim link'
"

echo ""
echo "=== 4. Get claim token ==="
TOKEN=$(curl -s $BASE/scenario | python3 -c "
import sys,json
d=json.load(sys.stdin)
for o in d['netObligations']:
    if o.get('claimToken'):
        print(o['claimToken'])
        break
")
echo "Token: ${TOKEN:0:25}..."

echo ""
echo "=== 5. Open claim link ==="
curl -s $BASE/claim/$TOKEN | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Recipient: {d[\"recipient\"][\"name\"]}')
print(f'Amount: {d[\"obligation\"][\"amountUsd\"]:.2f} USD')
print(f'Payout options: {len(d[\"payoutOptions\"])}')
print(f'Status: {d[\"link\"][\"status\"]}')
"

echo ""
echo "=== 6. Claim with payout method ==="
curl -s -X POST $BASE/claim/$TOKEN/claim \
  -H "Content-Type: application/json" \
  -d '{"payoutMethod": "Local bank transfer (provide IBAN / account no.)"}' | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Success: {d[\"success\"]}')
print(f'Message: {d[\"message\"]}')
print(f'Link status: {d[\"link\"][\"status\"]}')
print(f'Payout method: {d[\"link\"][\"payoutMethod\"]}')
"

echo ""
echo "=== 7. Run reconciliation ==="
curl -s -X POST $BASE/reconciliation/run | python3 -c "
import sys,json
d=json.load(sys.stdin)
for r in d['results']:
    print(f'{r[\"invoice\"][\"bookingRef\"]}: {r[\"status\"]}')
"

echo ""
echo "=== ALL TESTS PASSED ==="
