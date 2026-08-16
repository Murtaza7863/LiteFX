import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { cheapestRail } from "../data/railOptions.js";
import { clearStore, getStore, seedStore } from "../store.js";
import { traveler } from "../testUtil.js";
import { matchCheapestCorridor, matchGreedy, runNetting } from "./netting.js";

afterEach(() => {
  clearStore();
});

test("SEPA DE→FR is treated as local (0% fee), not USDC", () => {
  const pick = cheapestRail("DE", "FR", true);
  assert.equal(pick.type, "local");
  assert.equal(pick.railName, "SEPA Instant");
  assert.equal(pick.feeEstimatePct, 0);
});

test("same-country US uses Zelle as local", () => {
  const pick = cheapestRail("US", "US", true);
  assert.equal(pick.type, "local");
  assert.equal(pick.railName, "Zelle");
  assert.equal(pick.feeEstimatePct, 0);
});

test("SG→TH with accounts uses the linked PayNow↔PromptPay rail", () => {
  const pick = cheapestRail("SG", "TH", true);
  assert.equal(pick.type, "linked");
  assert.ok(pick.feeEstimatePct < 1.5);
});

test("unknown corridor with accounts falls back to USDC", () => {
  const pick = cheapestRail("US", "JP", true);
  assert.equal(pick.type, "stable_bridge");
  assert.equal(pick.feeEstimatePct, 1.5);
});

test("MY→SG with accounts uses the DuitNow↔PayNow linked rail", () => {
  const pick = cheapestRail("MY", "SG", true);
  assert.equal(pick.type, "linked");
  assert.match(pick.railName, /DuitNow/i);
});

test("IT→NL is SEPA Instant even though the countries differ", () => {
  const pick = cheapestRail("IT", "NL", true);
  assert.equal(pick.type, "local");
  assert.equal(pick.railName, "SEPA Instant");
});

test("recipient with no account is always claim_link", () => {
  const pick = cheapestRail("SG", "SG", false);
  assert.equal(pick.type, "claim_link");
});

test("cheapest-corridor matching prefers same-country rails over largest-first", () => {
  const entities = [
    traveler("bob", "Bob", "TH", "promptpay"),
    traveler("alice", "Alice", "US", "zelle"),
    traveler("frank", "Frank", "TH", "promptpay"),
    traveler("charlie", "Charlie", "US", "zelle"),
  ];
  const debtors = [
    { id: "bob", amount: 100 },
    { id: "alice", amount: 100 },
  ];
  const creditors = [
    { id: "charlie", amount: 100 },
    { id: "frank", amount: 100 },
  ];

  const greedy = matchGreedy(debtors, creditors, entities);
  const cheap = matchCheapestCorridor(debtors, creditors, entities);

  assert.deepEqual(greedy.map((o) => `${o.from}->${o.to}`).sort(), [
    "alice->frank",
    "bob->charlie",
  ]);
  assert.deepEqual(cheap.map((o) => `${o.from}->${o.to}`).sort(), [
    "alice->charlie",
    "bob->frank",
  ]);
});

test("unequal balances split across multiple creditors and conserve USD", () => {
  const entities = [
    traveler("d", "Debtor", "US", "zelle"),
    traveler("c1", "C1", "US", "zelle"),
    traveler("c2", "C2", "US", "zelle"),
  ];
  const cheap = matchCheapestCorridor(
    [{ id: "d", amount: 150 }],
    [
      { id: "c1", amount: 100 },
      { id: "c2", amount: 50 },
    ],
    entities,
  );
  assert.equal(cheap.length, 2);
  const total = cheap.reduce((s, o) => s + o.amountUsd, 0);
  assert.equal(total, 150);
});

test("dust below half a cent is not turned into an obligation", () => {
  const entities = [
    traveler("d", "Debtor", "US", "zelle"),
    traveler("c", "Creditor", "US", "zelle"),
  ];
  const cheap = matchCheapestCorridor(
    [{ id: "d", amount: 0.001 }],
    [{ id: "c", amount: 0.001 }],
    entities,
  );
  assert.equal(cheap.length, 0);
});

test("missing entities are skipped instead of throwing", () => {
  const cheap = matchCheapestCorridor(
    [{ id: "ghost-d", amount: 10 }],
    [{ id: "ghost-c", amount: 10 }],
    [],
  );
  assert.equal(cheap.length, 0);
});

test("sample trip nets fewer transfers than pairwise debts and balances sum to ~0", () => {
  seedStore();
  const result = runNetting();
  assert.ok(result.rawEdgeCount > result.netEdgeCount);
  assert.ok(result.netEdgeCount > 0);
  const balSum = result.balances.reduce((s, b) => s + b.netUsd, 0);
  assert.ok(Math.abs(balSum) < 0.05, `balances should net to 0, got ${balSum}`);
  const absBal = result.balances.reduce((s, b) => s + Math.abs(b.netUsd), 0);
  assert.ok(
    Math.abs(absBal / 2 - result.netTotalUsd) < 0.05,
    "netted volume should equal half the absolute balances",
  );
});

test("disconnected groups are not netted across", () => {
  seedStore();
  clearStore();
  const st = getStore();
  st.entities = [
    traveler("a", "A", "US", "zelle"),
    traveler("b", "B", "US", "zelle"),
    traveler("c", "C", "TH", "promptpay"),
    traveler("d", "D", "TH", "promptpay"),
  ];
  st.debtEdges = [
    {
      id: "e1",
      from: "a",
      to: "b",
      amount: 40,
      currency: "USD",
      amountUsd: 40,
      sourceExpenseId: "x",
    },
    {
      id: "e2",
      from: "c",
      to: "d",
      amount: 25,
      currency: "USD",
      amountUsd: 25,
      sourceExpenseId: "y",
    },
  ];
  const result = runNetting();
  assert.equal(result.netEdgeCount, 2);
  const pairs = result.obligations.map((o) => `${o.from}->${o.to}`).sort();
  assert.deepEqual(pairs, ["a->b", "c->d"]);
});

test("empty trip produces no obligations", () => {
  clearStore();
  const result = runNetting();
  assert.equal(result.netEdgeCount, 0);
  assert.equal(result.obligations.length, 0);
});
