# LiteFX

**Live demo:** https://murtaza7863.github.io/LiteFX/

A group trip splitter for people who paid in different countries. LiteFX nets the IOUs into a handful of transfers, then picks a rail for each corridor: PayNow, PromptPay, SEPA, Zelle, PayNow-PromptPay, or USDC.

## 3-minute demo

Record against the live demo. The sample trip is already netted and routed.

1. **0:00 Problem.** Friends in SG, TH, US, and DE split a Bangkok trip in THB, SGD, and USD. Splitwise would leave a web of IOUs, then everyone pays the expensive way.
2. **0:20 Open the sample.** Show the scoreboard: pairwise IOUs collapsed into a few transfers, fees saved, cheapest-corridor matching vs largest-first. Copy recap if you want a group-chat paste.
3. **0:50 Rails.** Open a transfer. The chip is a real rail (PromptPay, PayNow, USDC), not "local". Toggle **Try another rail** and watch the fee in dollars change.
4. **1:20 Remap.** Edit Bob, move him from Thailand to Japan, Save. PromptPay cannot follow him. The graph rebuilds onto legal corridors.
5. **1:50 Claim link.** Edit Eve, uncheck **Has a linked account**, Save. Her payout becomes a claim link. Open it and pick a Singapore payout. The sender never uses her domestic rail.
6. **2:20 Settle.** Copy slips for the group, settle a local transfer, flip **Who owes whom** from IOUs to transfers. Trip books should still net to $0.00.
7. **2:45 Close.** Every rail is simulated. No bank, card, or chain calls. The product is a corridor-aware settlement layer on a trip tab.

## What it can do

- Track a trip: travelers, countries, linked rails, and shared expenses in mixed currencies.
- Net pairwise debts into the fewest transfers, matching cheap corridors first (same-country / SEPA, then linked rails, then USDC).
- Show a send slip for each transfer: who pays whom, which rail, fee, FX.
- Let you try another rail on a transfer (PromptPay at 0% vs USDC at 1.5%) and watch the fee change.
- Remap rails when someone changes country. A Thai PromptPay payout will not survive a move to Japan.
- Settle a transfer (copy the slip) or, if someone has no linked account, issue a claim link they can cash out in their country.
- Copy a trip recap, all send slips, or the settlement plan for the group chat.

## What it cannot do

- Move real money. Every rail is simulated. No bank, card, or on-chain calls.
- Invent a domestic rail that does not exist in that country.
- Share a claim link across devices on the GitHub Pages demo. That build lives in the browser; the token stays on that machine.
- Replace a bank, Wise, or Splitwise. It is a corridor-aware settlement layer on top of a trip tab.

## Stack

npm workspaces. Express + TypeScript API. React + Vite + Tailwind UI. GitHub Pages runs the same engine in the browser (`VITE_STATIC=1`). `npm test` covers backend agents, HTTP routes, corridor legality, and frontend recap/slip math.

```bash
npm install && npm run dev
```

Local UI: http://localhost:5173 · API: http://localhost:3001
