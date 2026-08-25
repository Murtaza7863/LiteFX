import assert from "node:assert/strict";
import { test } from "node:test";

import type { Entity, Expense, NetObligation } from "../api/client.ts";
import {
  railMix,
  recapText,
  settleProgress,
  splitSummary,
  totalFeesUsd,
  tripSnapshot,
  vsCostliest,
} from "./settlementRecap.ts";

const alice: Entity = {
  id: "a",
  name: "Alice Tan",
  country: "SG",
  contact: { type: "email", value: "a" },
  linkedRailAliases: [{ railType: "PayNow", alias: "a" }],
};
const bob: Entity = {
  id: "b",
  name: "Bob Sukhum",
  country: "TH",
  contact: { type: "email", value: "b" },
  linkedRailAliases: [{ railType: "PromptPay", alias: "b" }],
};

function ob(partial: Partial<NetObligation>): NetObligation {
  return {
    id: "net-1",
    from: alice.id,
    to: bob.id,
    amount: 100,
    settlementCurrency: "USD",
    amountUsd: 100,
    status: "routed",
    ...partial,
  };
}

test("tripSnapshot lists distinct countries and currencies", () => {
  const expenses: Expense[] = [
    {
      id: "e1",
      payerId: "a",
      participantIds: ["a", "b"],
      amount: 9000,
      currency: "THB",
      tripId: "t",
      category: "stay",
      description: "Hotel",
    },
    {
      id: "e2",
      payerId: "a",
      participantIds: ["a"],
      amount: 50,
      currency: "SGD",
      tripId: "t",
      category: "food",
      description: "Laksa",
    },
  ];
  const snap = tripSnapshot([alice, bob], expenses);
  assert.equal(snap.travelerCount, 2);
  assert.equal(snap.expenseCount, 2);
  assert.deepEqual(snap.countries, ["SG", "TH"]);
  assert.deepEqual(snap.currencies, ["THB", "SGD"]);
});

test("railMix groups by the chosen rail name", () => {
  const mix = railMix([
    ob({
      chosenRail: "local",
      considered: [
        {
          type: "local",
          railName: "PayNow",
          feeEstimatePct: 0,
          timeEstimateHours: 0,
          chosen: true,
          note: "",
        },
      ],
    }),
    ob({
      id: "net-2",
      chosenRail: "local",
      considered: [
        {
          type: "local",
          railName: "PayNow",
          feeEstimatePct: 0,
          timeEstimateHours: 0,
          chosen: true,
          note: "",
        },
      ],
    }),
    ob({
      id: "net-3",
      chosenRail: "stable_bridge",
      considered: [
        {
          type: "stable_bridge",
          railName: "USDC Bridge (Circle)",
          feeEstimatePct: 1.5,
          timeEstimateHours: 24,
          chosen: true,
          note: "",
        },
      ],
    }),
  ]);
  assert.deepEqual(mix, [
    { name: "PayNow", count: 2 },
    { name: "USDC Bridge (Circle)", count: 1 },
  ]);
});

test("vsCostliest is the dollar gap vs the most expensive eligible rail", () => {
  const pick = vsCostliest(
    ob({
      amountUsd: 200,
      feeUsd: 0,
      considered: [
        {
          type: "local",
          railName: "PromptPay",
          feeEstimatePct: 0,
          timeEstimateHours: 0,
          chosen: true,
          note: "same country",
        },
        {
          type: "stable_bridge",
          railName: "USDC Bridge (Circle)",
          feeEstimatePct: 1.5,
          timeEstimateHours: 24,
          chosen: false,
          note: "fallback",
        },
      ],
    }),
  );
  assert.equal(pick?.name, "USDC Bridge (Circle)");
  assert.equal(pick?.savingsUsd, 3);
});

test("vsCostliest ignores ineligible rows and zero gaps", () => {
  assert.equal(
    vsCostliest(
      ob({
        considered: [
          {
            type: "local",
            railName: "PayNow",
            feeEstimatePct: 0,
            timeEstimateHours: 0,
            chosen: true,
            note: "",
          },
          {
            type: "linked",
            railName: "PayNow-PromptPay",
            feeEstimatePct: 0.5,
            timeEstimateHours: 1,
            chosen: false,
            eligible: false,
            note: "",
          },
        ],
      }),
    ),
    null,
  );
});

test("settleProgress and totalFeesUsd track open transfers", () => {
  const rows = [
    ob({ status: "settled", feeUsd: 0 }),
    ob({ id: "n2", status: "routed", feeUsd: 1.25 }),
    ob({ id: "n3", status: "routed", feeUsd: 0.5 }),
  ];
  assert.deepEqual(settleProgress(rows), {
    total: 3,
    settled: 1,
    remaining: 2,
    pct: 33,
  });
  assert.equal(totalFeesUsd(rows), 1.75);
});

test("recapText is a pasteable group-chat summary", () => {
  const text = recapText({
    tripName: "Bangkok Trip 2026",
    netting: {
      rawEdgeCount: 12,
      netEdgeCount: 4,
      feeSavingsUsd: 8.4,
      corridorSavingsUsd: 2.1,
      greedyFeeUsd: 5.5,
    },
    obligations: [
      ob({
        chosenRail: "linked",
        considered: [
          {
            type: "linked",
            railName: "PayNow-PromptPay",
            feeEstimatePct: 0.5,
            timeEstimateHours: 1,
            chosen: true,
            note: "",
          },
        ],
      }),
    ],
    entityOf: (id) => (id === alice.id ? alice : bob),
  });
  assert.match(text, /LiteFX · Bangkok Trip 2026/);
  assert.match(text, /12 IOUs became 4 transfers/);
  assert.match(text, /PayNow-PromptPay/);
  assert.match(text, /Alice Tan → Bob Sukhum/);
  assert.doesNotMatch(text, /—/);
});

test("splitSummary keeps short lists and clips long ones", () => {
  const people = [
    { id: "a", name: "Alice Tan" },
    { id: "b", name: "Bob Sukhum" },
    { id: "c", name: "Charlie Reed" },
    { id: "d", name: "Diana Weber" },
  ];
  assert.equal(splitSummary(["a", "b"], people), "Alice, Bob");
  assert.equal(splitSummary(["a", "b", "c", "d"], people), "Alice, Bob +2");
});
