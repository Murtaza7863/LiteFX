#!/bin/bash
set -e
BASE=http://localhost:3001/api

echo "=== Starting backend ==="
cd backend && npx tsx src/index.ts &
BACKEND_PID=$!
sleep 2

echo ""
echo "=== 1. Get scenario ==="
curl -s $BASE/scenario | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Entities: {len(d[\"entities\"])}, Expenses: {len(d[\"expenses\"])}, DebtEdges: {len(d[\"debtEdges\"])}')
"

echo ""
echo "=== 2. Run netting ==="
curl -s -X POST $BASE/netting/run | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Raw: {d[\"rawEdgeCount\"]} -> Net: {d[\"netEdgeCount\"]} (ratio {d[\"reductionRatio\"]}:1)')
"

echo ""
echo "=== 3. Run routing ==="
curl -s -X POST $BASE/routing/run | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Rail types: {d[\"railTypesExercised\"]}')
for o in d['obligations']:
    print(f'  {o[\"id\"]}: {o[\"from\"]}->{o[\"to\"]} rail={o.get(\"chosenRail\",\"?\")} {o[\"amountUsd\"]:.2f}USD')
"

echo ""
echo "=== 4. Settle claim_link obligation (net-5) ==="
curl -s -X POST $BASE/settlement/net-5/settle | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Success: {d[\"success\"]} - {d[\"message\"]}')
"

echo ""
echo "=== 5. Get claim token ==="
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
echo "=== 6. Open claim link ==="
curl -s $BASE/claim/$TOKEN | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Recipient: {d[\"recipient\"][\"name\"]}')
print(f'Amount: {d[\"obligation\"][\"amountUsd\"]:.2f} USD')
print(f'Payout options: {len(d[\"payoutOptions\"])}')
print(f'Status: {d[\"link\"][\"status\"]}')
"

echo ""
echo "=== 7. Claim with payout method ==="
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
echo "=== 8. Run reconciliation ==="
curl -s -X POST $BASE/reconciliation/run | python3 -c "
import sys,json
d=json.load(sys.stdin)
for r in d['results']:
    print(f'{r[\"invoice\"][\"bookingRef\"]}: {r[\"status\"]}')
"

echo ""
echo "=== ALL TESTS PASSED ==="

kill $BACKEND_PID 2>/dev/null
