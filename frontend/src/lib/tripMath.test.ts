import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  DebtEdge,
  Entity,
  Expense,
  NetObligation,
} from "../api/client.ts";
import {
  bookPositionUsd,
  booksCloseUsd,
  previewShares,
  remainingFromObligations,
  runningBalances,
  toUsd,
} from "./tripMath.ts";

const people: Entity[] = [
  {
    id: "a",
    name: "Ada",
    country: "US",
    contact: { type: "email", value: "a" },
    linkedRailAliases: [],
  },
  {
    id: "b",
    name: "Ben",
    country: "SG",
    contact: { type: "email", value: "b" },
    linkedRailAliases: [],
  },
];

test("equal split remainder lands on the payer", () => {
  const shares = previewShares({
    amount: 10.01,
    payerId: "a",
    participantIds: ["a", "b", "c"],
    mode: "equal",
    parts: {},
  });
  assert.equal(shares.a, 3.35);
  assert.equal(shares.b, 3.33);
  assert.equal(shares.c, 3.33);
});

test("running balances net to zero when IOUs close", () => {
  const edges: DebtEdge[] = [
    {
      id: "1",
      from: "b",
      to: "a",
      amount: 20,
      currency: "USD",
      amountUsd: 20,
      sourceExpenseId: "e1",
    },
    {
      id: "2",
      from: "a",
      to: "b",
      amount: 5,
      currency: "USD",
      amountUsd: 5,
      sourceExpenseId: "e2",
    },
  ];
  const bals = runningBalances(people, edges);
  assert.equal(bals.find((b) => b.entityId === "a")?.netUsd, 15);
  assert.equal(bals.find((b) => b.entityId === "b")?.netUsd, -15);
  assert.equal(booksCloseUsd(bals).closed, true);
});

test("toUsd uses the snapshot rate the UI was given", () => {
  const exp: Expense = {
    id: "e",
    payerId: "a",
    participantIds: ["a"],
    amount: 100,
    currency: "SGD",
    tripId: "t",
    category: "food",
    description: "Laksa",
  };
  assert.equal(toUsd(exp.amount, exp.currency, { SGD: 0.74 }), 74);
  assert.equal(toUsd(exp.amount, "USD"), 100);
});

test("settled transfers drop out of the open trip-book position", () => {
  const remaining = remainingFromObligations(people, [
    {
      id: "1",
      from: "b",
      to: "a",
      amount: 15,
      settlementCurrency: "USD",
      amountUsd: 15,
      status: "settled",
    },
    {
      id: "2",
      from: "b",
      to: "a",
      amount: 5,
      settlementCurrency: "USD",
      amountUsd: 5,
      status: "routed",
    },
  ] as NetObligation[]);
  assert.equal(remaining.get("a")?.receiveUsd, 5);
  assert.equal(remaining.get("b")?.payUsd, 5);
  assert.equal(bookPositionUsd(20, remaining.get("a"), true), 5);
  assert.equal(bookPositionUsd(20, remaining.get("a"), false), 20);
  assert.equal(bookPositionUsd(-20, { payUsd: 0, receiveUsd: 0 }, true), 0);
});
