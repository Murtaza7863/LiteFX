# LiteFX — Cross-border Netting & Settlement Engine

A group expense splitter that collapses multi-currency travel debts into the fewest transfers, then routes each remaining payout through a simulated local, linked, claim-link, or USDC rail.

Rails stay simulated. No real bank or payment APIs.

## Quick Start

```bash
npm install
npm run dev
```

- Backend: http://localhost:3001
- Frontend: http://localhost:5173

Local development uses a JSON file store (`backend/data/db.json`) and a normal signup/login session.

## Deploy

**GitHub Pages:** pushes to `main` publish https://murtaza7863.github.io/LiteFX/. The engine runs in the browser. Trip data and claim tokens stay on that device, so claim links are a same-browser recipient preview, not a cross-device payout.

**Render + free Neon:** one web service for the API and built frontend, with optional Postgres for durable accounts and trips.

1. Create a free [Neon](https://neon.tech) project and copy the connection string.
2. Deploy this repo on Render (`render.yaml`) as a free web service.
3. Set `DATABASE_URL` to the Neon URL. Leave `ENABLE_DEMO_AUTH=true` if you want one-click demo accounts on the hosted API.
4. Health check is `GET /api/health`.

Without `DATABASE_URL`, the server still runs and falls back to JSON. Render’s free filesystem is ephemeral, so Neon is what keeps data across restarts.

## Demo Flow (under 2 minutes)

1. **Open or name a trip** — start a blank one, or load the sample (6 travelers across Singapore, Thailand, the US, and Germany). Past trips stay in the header.
2. **Type an expense title** — “Grab to the airport” classifies as Transport before you pick a category.
3. **Click Net & route** — pairwise IOUs collapse into a handful of transfers, each with a rail and fee.
4. **Open a transfer → Try another rail** — switch a PromptPay (0%) payout to USDC (1.5%) and watch the fee jump.
5. **Link Eve's PayNow** — the insight button drops her claim link and re-routes onto local PayNow.
6. **Copy send instructions, then Settle** — local/linked/USDC mark settled. A remaining claim link opens a recipient preview (same browser on Pages; shareable on the server).

## Persistence and auth

| Mode | Store | Auth | Claim links |
|------|--------|------|-------------|
| Local `npm run dev` | `backend/data/db.json` | Signup / login cookies | Shareable on localhost |
| GitHub Pages | Browser `localStorage` | Auto demo session | Same-device preview only |
| Render + Neon | Postgres (`DATABASE_URL`) | Signup / login / optional demo | Cross-device |

## Architecture

```
LiteFX/
├── backend/src/
│   ├── index.ts              # Express (port 3001), CORS, compiled start
│   ├── auth.ts               # Sessions, CSRF, rate limits
│   ├── store.ts              # Per-user named trips; JSON or Postgres
│   ├── postgres.ts           # Free Neon adapter
│   ├── fx.ts                 # Live frankfurter rates + snapshot
│   ├── routes.ts             # HTTP API
│   ├── data/classifyExpense.ts
│   └── agents/
│       ├── netting.ts        # Corridor-aware multilateral netting
│       ├── railRouter.ts     # Rail pick, override, re-route
│       ├── claimLink.ts      # Claim tokens and settlement
│       ├── plan.ts           # Settlement plan + link-account tips
│       ├── compliance.ts     # Flags only; not shown in the UI
│       └── reconciliation.ts # Invoice matching; not shown in the UI
└── frontend/src/
    ├── App.tsx
    ├── engine/staticClient.ts  # Browser engine for GitHub Pages
    └── components/
```

Netting matches cheapest corridors first (local / SEPA / linked) instead of largest-debtor → largest-creditor. The greedy baseline is still computed so the UI can show extra fee savings.

## API

Protected routes need a session cookie. Browser clients also send `X-LiteFX-Request: 1` on mutations.

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/health` | Public |
| POST | `/api/auth/signup` `/login` `/logout` `/demo` | Demo is off in production unless `ENABLE_DEMO_AUTH=true` |
| GET | `/api/auth/me` | |
| GET | `/api/scenario` | Active trip, trip list, debts, nets, ledger, FX, plan |
| POST | `/api/seed` `/clear` | Sample / blank the **active** trip |
| POST | `/api/trips` | Create a named trip and switch to it |
| POST | `/api/trips/:id/select` | Switch active trip |
| PATCH | `/api/trips/:id` | Rename |
| DELETE | `/api/trips/:id` | Delete (keeps at least one) |
| POST/PATCH/DELETE | `/api/entities` `/api/expenses` | Title classifies category when omitted |
| POST | `/api/engine/run` | Net + route; 409 if already netted |
| POST | `/api/obligations/:id/rail` | Override rail |
| POST | `/api/entities/:id/link-account` | Attach primary rail and re-route |
| POST | `/api/settlement/:id/settle` | Simulated payout or claim-link issue |
| GET/POST | `/api/claim/:token` | Public recipient claim |

Compliance and reconciliation agents still exist for tests. They are not product UI.

## Testing

```bash
npm test
bash test-flow.sh   # needs a free local port 3001
```

CI on `main` runs backend tests, frontend typecheck + slip/classifier tests, both builds, then deploys GitHub Pages.

## Tech stack

Node 20+, Express, React, Vite, Tailwind. Optional `pg` + Neon for hosted persistence.
