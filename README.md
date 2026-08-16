# LiteFX

Split a group trip across countries. LiteFX nets the IOUs into the fewest transfers, then picks a simulated rail for each one — local (PayNow, PromptPay, SEPA, Zelle), a real linked corridor (PayNow↔PromptPay), or USDC when nothing else fits.

**Live demo:** https://murtaza7863.github.io/LiteFX/

React + Vite frontend, Express + TypeScript backend. Rails are simulated — no real bank or card charges.

## 2-minute demo

1. Open the live demo (or `npm install && npm run dev`).
2. **Load sample** — Bangkok trip, six people in SG / TH / US / DE.
3. **Net & route** — pairwise debts collapse into a handful of transfers.
4. Open a transfer → **Try another rail** (PromptPay 0% → USDC 1.5%).
5. Edit a traveler’s country and Save — rails remap; an impossible domestic payout never appears.
6. **Settle** — copy the send slip. That’s the product.

Claim links still exist if you add someone with **Has a linked account** off. The sample does not use that path.

## Run locally

```bash
npm install
npm run dev
```

- App: http://localhost:5173
- API: http://localhost:3001

Sign up, then load the sample. Data lives in `backend/data/db.json`.

```bash
npm test
```

## What judges should look at

| Piece | Where |
| --- | --- |
| Corridor-aware netting | `backend/src/agents/netting.ts` |
| Rail pick / override / rebuild | `backend/src/agents/railRouter.ts` |
| Country + rail table | `backend/src/data/countries.ts` |
| Sample trip | `backend/src/data/seed.ts` |
| Pages (in-browser engine) | `frontend/src/engine/staticClient.ts` |

## Deploy

Pushes to `main` publish GitHub Pages. For a durable API, deploy with `render.yaml` and set `DATABASE_URL` to a [Neon](https://neon.tech) Postgres URL.

| | Store | Auth |
| --- | --- | --- |
| Local | JSON file | Signup |
| GitHub Pages | `localStorage` | Auto demo |
| Render + Neon | Postgres | Signup / demo |
