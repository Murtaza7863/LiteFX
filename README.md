# Agentic Trip Wallet — Cross-border Netting & Settlement Engine

A multi-agent system that pools multi-currency travel debts across an entire user base, collapses them into the minimum number of cross-border transfers via multilateral netting, then routes each remaining transfer through whichever settlement rail is cheapest and fastest for that specific corridor — including a path for recipients who have no account on the platform at all.

## Quick Start

```bash
# From the project root
npm install
npm run dev
```

This starts both servers concurrently:
- **Backend**: http://localhost:3001 (Express + TypeScript)
- **Frontend**: http://localhost:5173 (React + Vite + Tailwind)

Open http://localhost:5173 in your browser.

## Demo Flow (under 2 minutes)

1. **View the scenario** — 6 travelers across Singapore, Thailand, the US, and Germany, with 9 shared expenses and 30 raw pairwise debts.
2. **Click "Run Netting"** — watch the debt graph collapse from 30 edges to 5 net obligations (6:1 reduction).
3. **Click "Route All"** — each obligation gets a rail assignment with a human-readable reasoning string. All 4 rail types are exercised:
   - `local` — same-country instant rail (e.g. PromptPay within Thailand)
   - `linked` — bilateral instant-payment scheme (e.g. PayNow↔PromptPay between SG and TH)
   - `claim_link` — for recipients with no linked account
   - `stable_bridge` — stablecoin fallback for corridors with no direct rail
4. **Click "Settle All"** — obligations settle (mocked). The claim-link obligation generates a claim token.
5. **Click "Open Claim Link"** — a modal simulates the recipient's view. Pick a payout method, click "Claim" — no account creation needed.
6. **Click "Compliance"** — shows compliance flags (rules stub, no blocking).
7. **Click "Reconciliation"** — matches settled amounts against vendor invoices, flags mismatches.

## Architecture

```
trip-wallet/
├── package.json              # Root — concurrently runs both servers
├── backend/
│   ├── src/
│   │   ├── index.ts          # Express server (port 3001)
│   │   ├── types.ts          # All data models + mock FX table + compliance limits
│   │   ├── store.ts          # In-memory store (no database at hackathon scale)
│   │   ├── routes.ts         # API routes
│   │   ├── data/
│   │   │   ├── seed.ts       # Seeded scenario (6 entities, 9 expenses, 3 invoices)
│   │   │   └── railOptions.ts# Mock rail-options table
│   │   └── agents/
│   │       ├── netting.ts    # Agent 1: greedy multilateral netting
│   │       ├── railRouter.ts # Agent 2: rail routing with reasoning
│   │       ├── claimLink.ts  # Agent 3: claim-link generation & settlement
│   │       ├── compliance.ts # Agent 4: rules-based compliance stub
│   │       └── reconciliation.ts # Agent 5: B2B invoice matching
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # Main orchestrator + action bar
│   │   ├── api/client.ts     # Typed API client
│   │   └── components/
│   │       ├── DebtGraph.tsx       # SVG debt graph (raw → netted)
│   │       ├── ObligationCard.tsx  # Per-obligation card with rail + reason
│   │       ├── ClaimLinkModal.tsx  # Recipient claim-link view
│   │       ├── ScenarioOverview.tsx
│   │       └── ReconciliationView.tsx
│   └── package.json
└── test-flow.sh             # End-to-end API test script
```

## Agents

### Agent 1 — Netting Agent (`agents/netting.ts`)
Converts pairwise multi-currency debts into the fewest possible net transfers using a greedy "largest-debtor → largest-creditor" approach (the same algorithm Splitwise uses for "simplify debts"). Not globally optimal in every edge case, but fast and well-understood.

**Steps:**
1. Convert every `DebtEdge` amount to USD (reference currency) using the mock FX table.
2. For each connected component, compute each entity's net balance.
3. Split into creditors (positive) and debtors (negative).
4. Greedily match largest debtor to largest creditor, settle the smaller amount, repeat.
5. Output `NetObligation` records, converting back to the recipient's local currency.

**Result on seeded scenario:** 30 raw debt edges → 5 net obligations (6:1 reduction).

### Agent 2 — Rail Router Agent (`agents/railRouter.ts`)
Assigns each `NetObligation` a settlement rail and explains *why* via the `routingReason` string (surfaced directly in the UI).

**Decision logic (evaluated in order):**
1. Recipient has no `linkedRailAliases` → `claim_link` (they can't receive into an account they don't have).
2. Same country + local instant rail exists → `local`.
3. Linked bilateral rail connects the two countries → `linked`.
4. Fallback → `stable_bridge`.

> **Note on ordering:** The spec lists claim_link as step 3, but the "regardless of what rail would otherwise apply" qualifier means it must be checked before local/linked — otherwise a recipient with no account in a linked corridor (e.g. SG↔TH) would be routed to "linked" even though they can't use it.

### Agent 3 — Claim-link Agent (`agents/claimLink.ts`)
When routing outputs `claim_link`:
1. Generate a unique token bound to the obligation ID and recipient's contact.
2. Status: `pending` → `claimed` → `expired` (mock 7-day expiry).
3. Recipient opens the link, picks a payout method from a mocked list, status flips to `claimed`. No account creation step.

### Agent 4 — Compliance Stub (`agents/compliance.ts`)
Rules-based check that runs before an obligation is marked "routed":
- Flags any `NetObligation` above a mock per-corridor limit.
- Flags if the same entity pair nets more than N times in a rolling window.
- Surfaces flags in the UI as warning badges — does not block execution.

### Agent 5 — B2B Reconciliation (`agents/reconciliation.ts`)
Matches settled `NetObligation` amounts against the `Invoice` list for vendor-side obligations. Flags mismatches. Shows a "net settlement due this week" summary per vendor.

## Mocked Integration Points

Everything below is **mocked** for this hackathon build. Each is labeled in code with a comment noting what the real integration would look like.

| Component | What's Mocked | Production Integration |
|-----------|--------------|----------------------|
| **FX rates** | Static table in `types.ts` | Live FX API (Open Exchange Rates, Wise/Fixer API) |
| **Rail options** | Static table in `data/railOptions.ts` | Rail-routing service (Wise, Airwallex, proprietary layer) |
| **Settlement execution** | `settleObligation()` returns mocked "settled" | Rail API: PayNow/PromptPay/Zelle/SEPA (local), bilateral gateway (linked), Circle USDC API (stable_bridge) |
| **Claim-link delivery** | Token generated in-memory, no SMS/email sent | Twilio/SendGrid for link delivery, signed JWT tokens, DB-backed claim state |
| **Claim payout** | Payout method stored, no real transfer | Wise, Stripe, or local rail payout API |
| **KYC/AML** | Rules stub (limit checks + anomaly flags) | Real compliance engine (sanctions screening, transaction monitoring, regulatory reporting) |
| **Reconciliation** | In-memory matching against mock invoices | ERP/accounting integration (Xero, QuickBooks, SAP) with double-entry rules |
| **Database** | In-memory store | SQLite (hackathon) or Postgres (production) |
| **User auth** | None beyond demo claim-link UX | OAuth/OIDC with session management |

## Seeded Scenario

6 travelers on a "Bangkok Trip 2026":

| Entity | Country | Linked Account |
|--------|---------|---------------|
| Alice Tan | SG | PayNow |
| Bob Sukhum | TH | PromptPay |
| Charlie Reed | US | Zelle |
| Diana Weber | DE | SEPA |
| Eve Lim | SG | **None** ← forces claim_link |
| Frank Chaem | TH | PromptPay |

9 shared expenses across 4 currencies (THB, SGD, USD, EUR) generate 30 pairwise debt edges.

**After netting (5 obligations):**

| # | From → To | Amount (USD) | Rail | Reason |
|---|-----------|-------------|------|--------|
| 1 | Diana (DE) → Charlie (US) | 360.30 | stable_bridge | No direct rail for DE↔US |
| 2 | Bob (TH) → Charlie (US) | 113.20 | stable_bridge | No direct rail for TH↔US |
| 3 | Bob (TH) → Frank (TH) | 130.60 | local | Same-country PromptPay |
| 4 | Alice (SG) → Frank (TH) | 175.60 | linked | PayNow↔PromptPay linkage |
| 5 | Alice (SG) → Eve (SG) | 41.70 | claim_link | Eve has no linked account |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/scenario` | Seeded scenario (entities, expenses, debts, obligations) |
| POST | `/api/netting/run` | Run the netting agent |
| POST | `/api/routing/run` | Run the rail router on pending obligations |
| POST | `/api/compliance/run` | Run compliance checks |
| POST | `/api/reconciliation/run` | Run B2B reconciliation |
| POST | `/api/settlement/:id/settle` | Mock-settle an obligation |
| POST | `/api/claim/:obligationId/create` | Generate a claim link |
| GET | `/api/claim/:token` | Get claim link details + payout options |
| POST | `/api/claim/:token/claim` | Claim with a chosen payout method |
| POST | `/api/reset` | Reset to seed state |

## Testing

```bash
# Start backend and run end-to-end API test
bash test-flow.sh
```

## Tech Stack

- **Backend**: Node.js + TypeScript + Express
- **Frontend**: React + Vite + Tailwind CSS
- **Single repo**, `npm run dev` starts both via `concurrently`
