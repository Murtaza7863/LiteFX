# LiteFX

**Live demo:** https://murtaza7863.github.io/LiteFX/

A group trip splitter for people who paid in different countries. LiteFX nets the IOUs into a handful of transfers, then picks a rail for each corridor: PayNow, PromptPay, SEPA, Zelle, PayNow-PromptPay, or USDC.

## 3-minute demo

Record against the live demo. It starts empty so you add your own people. Load the Bangkok sample only if you want a crew already filled in; hit **Net & route** yourself.

1. **0:00 Problem.** Friends in different countries split a trip in mixed currencies. Splitwise leaves a web of IOUs, then everyone pays the expensive way.
2. **0:20 Your rails.** Open the avatar menu → **Payment methods**. Pick your country. Add the rails that exist there (PayNow and FAST in Singapore, UPI in India, Pix in Brazil) and the IDs a sender needs. Save, then **Add me to this trip**.
3. **0:50 Crew.** Add friends the same way: country, then only that country's rails plus an alias. Or tap **Load sample** for Alice, Bob, Charlie, and the rest, then Net & route.
4. **1:20 Route.** Add a shared expense if you started empty. Hit **Net & route**. Open a transfer: the chip is a real rail, not "local". Toggle **Try another rail** and watch the fee in dollars change.
5. **1:50 Remap.** Edit Bob, move him from Thailand to Japan, Save. PromptPay cannot follow him. Run Net & route again if the graph dropped.
6. **2:10 Claim link.** Edit a traveler, remove every rail, Save. Their payout becomes a claim link. Open it and pick a local payout. The sender never uses their domestic rail.
7. **2:35 Close.** Copy slips, settle a local transfer. Every rail is simulated. No bank, card, or chain calls.

## What it can do

- Track a trip: travelers, countries, linked rails (with the IDs send slips need), and shared expenses in mixed currencies.
- Save your own country and payment types on the account, then add yourself to a trip.
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
