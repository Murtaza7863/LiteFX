# LiteFX

**Live demo:** https://murtaza7863.github.io/LiteFX/

A group trip splitter for people who paid in different countries. LiteFX nets the IOUs into a handful of transfers, then picks a rail for each corridor: PayNow, PromptPay, SEPA, Zelle, PayNow-PromptPay, or USDC.

## What it can do

- Track a trip: travelers, countries, linked rails, and shared expenses in mixed currencies.
- Net pairwise debts into the fewest transfers, matching cheap corridors first (same-country / SEPA, then linked rails, then USDC).
- Show a send slip for each transfer: who pays whom, which rail, fee, FX.
- Let you try another rail on a transfer (PromptPay at 0% vs USDC at 1.5%) and watch the fee change.
- Remap rails when someone changes country. A Thai PromptPay payout will not survive a move to Japan.
- Settle a transfer (copy the slip) or, if someone has no linked account, issue a claim link they can cash out in their country.

## What it cannot do

- Move real money. Every rail is simulated. No bank, card, or on-chain calls.
- Invent a domestic rail that does not exist in that country.
- Share a claim link across devices on the GitHub Pages demo. That build lives in the browser; the token stays on that machine.
- Replace a bank, Wise, or Splitwise. It is a corridor-aware settlement layer on top of a trip tab.

Open the demo, load the sample Bangkok trip, hit **Net & route**, then change a traveler's country and Save.

```bash
npm install && npm run dev
```
