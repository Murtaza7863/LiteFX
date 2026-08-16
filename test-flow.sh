#!/bin/bash
set -euo pipefail
PORT="${PORT:-3001}"
BASE=http://127.0.0.1:$PORT/api
COOKIE_JAR=$(mktemp)
ROOT="$(cd "$(dirname "$0")" && pwd)"
FLOW_DB="$ROOT/backend/data/db.flow.test.json"
trap 'rm -f "$COOKIE_JAR" "$FLOW_DB"; kill $BACKEND_PID 2>/dev/null || true' EXIT

echo "=== Starting backend on $PORT ==="
cd "$ROOT/backend"
PORT="$PORT" LITEFX_DB_PATH="$FLOW_DB" npx tsx src/index.ts &
BACKEND_PID=$!
for _ in $(seq 1 20); do
  if curl -sf "$BASE/health" >/dev/null; then
    break
  fi
  sleep 0.5
done
if ! curl -sf "$BASE/health" >/dev/null; then
  echo "Backend did not become ready on $PORT"
  exit 1
fi

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
assert 'claim_link' not in rails, 'sample crew all have accounts — no claim_link'
assert 'local' in rails, 'expected a local TH→TH or SG→SG rail'
"

echo ""
echo "=== 5. Settle a local transfer ==="
SETTLE_ID=$(curl -sf -c "$COOKIE_JAR" -b "$COOKIE_JAR" "$BASE/scenario" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for o in d['netObligations']:
    if o.get('chosenRail') == 'local':
        print(o['id'])
        break
")
echo "Local obligation: $SETTLE_ID"
curl -sf -c "$COOKIE_JAR" -b "$COOKIE_JAR" -H "X-LiteFX-Request: 1" \
  -X POST "$BASE/settlement/$SETTLE_ID/settle" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Success: {d[\"success\"]} - {d[\"message\"]}')
assert d['success']
"

echo ""
echo "=== 6. Save crew and reuse on a new trip ==="
CONTACT_ID=$(curl -sf -c "$COOKIE_JAR" -b "$COOKIE_JAR" -H "X-LiteFX-Request: 1" \
  -X POST "$BASE/contacts/save-crew" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['success']
assert len(d['contacts']) == 6
print(d['contacts'][0]['id'])
")
curl -sf -c "$COOKIE_JAR" -b "$COOKIE_JAR" -H "Content-Type: application/json" -H "X-LiteFX-Request: 1" \
  -X POST "$BASE/trips" -d '{"name":"Seoul"}' >/dev/null
curl -sf -c "$COOKIE_JAR" -b "$COOKIE_JAR" -H "Content-Type: application/json" -H "X-LiteFX-Request: 1" \
  -X POST "$BASE/entities" -d "{\"contactId\":\"$CONTACT_ID\"}" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['success']
print('Added', d['entity']['name'], 'from saved people')
"

echo ""
echo "=== ALL TESTS PASSED ==="
