import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  addExpense,
  addEntity,
  clearStore,
  deleteEntity,
  deleteExpense,
  getStore,
  refreshDerivedForFx,
  seedStore,
  updateEntity,
  updateExpense,
} from "./store.js";
import { expense, loadTrip, traveler } from "./testUtil.js";
import { runNetting } from "./agents/netting.js";
import { runRouting } from "./agents/railRouter.js";
import { settleObligation } from "./agents/claimLink.js";

afterEach(() => {
  clearStore();
});

test("equal split remainder goes to the payer so shares still sum", () => {
  loadTrip(
    [
      traveler("a", "A", "US", "zelle"),
      traveler("b", "B", "US", "zelle"),
      traveler("c", "C", "US", "zelle"),
    ],
    [
      expense({
        id: "e1",
        payerId: "a",
        participantIds: ["a", "b", "c"],
        amount: 10,
      }),
    ],
  );
  const edges = getStore().debtEdges;
  assert.equal(edges.length, 2);
  const total = edges.reduce((s, e) => s + e.amount, 0);
  assert.equal(total, 6.66);
  assert.deepEqual(edges.map((e) => `${e.from}->${e.to}:${e.amount}`).sort(), [
    "b->a:3.33",
    "c->a:3.33",
  ]);
});

test("equal split of two cents among three leaves the extra on the payer", () => {
  loadTrip(
    [
      traveler("a", "A", "US", "zelle"),
      traveler("b", "B", "US", "zelle"),
      traveler("c", "C", "US", "zelle"),
    ],
    [
      expense({
        id: "e1",
        payerId: "a",
        participantIds: ["a", "b", "c"],
        amount: 0.02,
      }),
    ],
  );
  assert.equal(getStore().debtEdges.length, 0);
});

test("equal split creates IOUs from everyone except the payer", () => {
  loadTrip(
    [
      traveler("a", "A", "US", "zelle"),
      traveler("b", "B", "US", "zelle"),
      traveler("c", "C", "US", "zelle"),
    ],
    [
      expense({
        id: "e1",
        payerId: "a",
        participantIds: ["a", "b", "c"],
        amount: 90,
      }),
    ],
  );
  const edges = getStore().debtEdges;
  assert.equal(edges.length, 2);
  assert.deepEqual(
    edges.map((e) => `${e.from}->${e.to}:${e.amountUsd}`).sort(),
    ["b->a:30", "c->a:30"],
  );
});

test("percent remainder is assigned to the payer so shares still sum", () => {
  loadTrip(
    [
      traveler("a", "A", "US", "zelle"),
      traveler("b", "B", "US", "zelle"),
      traveler("c", "C", "US", "zelle"),
    ],
    [
      expense({
        id: "e1",
        payerId: "a",
        participantIds: ["a", "b", "c"],
        amount: 100,
        split: { mode: "percent", parts: { b: 30, c: 20 } },
      }),
    ],
  );
  const edges = getStore().debtEdges;
  assert.deepEqual(
    edges.map((e) => `${e.from}->${e.to}:${e.amountUsd}`).sort(),
    ["b->a:30", "c->a:20"],
  );
});

test("exact-amount remainder is assigned to the payer", () => {
  loadTrip(
    [
      traveler("a", "A", "US", "zelle"),
      traveler("b", "B", "US", "zelle"),
      traveler("c", "C", "US", "zelle"),
    ],
    [
      expense({
        id: "e1",
        payerId: "a",
        participantIds: ["a", "b", "c"],
        amount: 90,
        split: { mode: "amount", parts: { b: 10, c: 20 } },
      }),
    ],
  );
  assert.deepEqual(
    getStore()
      .debtEdges.map((e) => `${e.from}->${e.to}:${e.amountUsd}`)
      .sort(),
    ["b->a:10", "c->a:20"],
  );
});

test("payer-only expense creates no debt edges", () => {
  loadTrip(
    [traveler("a", "A", "US", "zelle")],
    [expense({ id: "e1", payerId: "a", participantIds: ["a"], amount: 50 })],
  );
  assert.equal(getStore().debtEdges.length, 0);
});

test("splitting among others only does not pull the payer into the share", () => {
  loadTrip(
    [
      traveler("a", "A", "US", "zelle"),
      traveler("b", "B", "US", "zelle"),
      traveler("c", "C", "US", "zelle"),
    ],
    [
      expense({
        id: "e1",
        payerId: "a",
        participantIds: ["b", "c"],
        amount: 80,
      }),
    ],
  );
  assert.deepEqual(
    getStore()
      .debtEdges.map((e) => `${e.from}->${e.to}:${e.amountUsd}`)
      .sort(),
    ["b->a:40", "c->a:40"],
  );
});

test("deleting an expense recomputes debts", () => {
  loadTrip(
    [traveler("a", "A", "US", "zelle"), traveler("b", "B", "US", "zelle")],
    [
      expense({
        id: "e1",
        payerId: "a",
        participantIds: ["a", "b"],
        amount: 40,
      }),
    ],
  );
  assert.equal(deleteExpense("e1"), true);
  assert.equal(getStore().debtEdges.length, 0);
  assert.equal(deleteExpense("e1"), false);
});

test("deleting a non-payer traveler removes them from splits, not the bill", () => {
  loadTrip(
    [
      traveler("a", "A", "US", "zelle"),
      traveler("b", "B", "US", "zelle"),
      traveler("c", "C", "US", "zelle"),
    ],
    [
      expense({
        id: "e1",
        payerId: "a",
        participantIds: ["a", "b", "c"],
        amount: 90,
      }),
    ],
  );
  assert.equal(deleteEntity("b"), true);
  assert.equal(getStore().entities.length, 2);
  assert.equal(getStore().expenses.length, 1);
  assert.deepEqual(getStore().expenses[0].participantIds, ["a", "c"]);
  assert.deepEqual(
    getStore().debtEdges.map((e) => `${e.from}->${e.to}:${e.amount}`),
    ["c->a:45"],
  );
});

test("deleting a payer drops expenses they paid", () => {
  loadTrip(
    [traveler("a", "A", "US", "zelle"), traveler("b", "B", "US", "zelle")],
    [
      expense({
        id: "e1",
        payerId: "a",
        participantIds: ["a", "b"],
        amount: 40,
      }),
    ],
  );
  assert.equal(deleteEntity("a"), true);
  assert.equal(getStore().entities.length, 1);
  assert.equal(getStore().expenses.length, 0);
  assert.equal(getStore().debtEdges.length, 0);
});

test("adding an expense after netting clears derived settlement state", () => {
  seedStore();
  runNetting();
  assert.ok(getStore().netObligations.length > 0);
  addExpense(
    expense({
      id: "exp-extra",
      payerId: "ent-alice",
      participantIds: ["ent-alice", "ent-bob"],
      amount: 10,
    }),
  );
  assert.equal(getStore().netObligations.length, 0);
  assert.equal(getStore().nettingSummary, null);
  assert.equal(getStore().claimLinks.length, 0);
  assert.equal(getStore().ledger.length, 0);
  assert.equal(getStore().invoices.length, 0);
});

test("settlement ledger remains immutable when trip inputs change", () => {
  seedStore();
  runNetting();
  runRouting();
  const payable = getStore().netObligations.find(
    (o) => o.chosenRail !== "claim_link",
  );
  assert.ok(payable);
  assert.equal(settleObligation(payable.id).success, true);
  assert.equal(getStore().ledger.length, 1);

  addExpense(
    expense({
      id: "exp-after-settlement",
      payerId: "ent-alice",
      participantIds: ["ent-alice", "ent-bob"],
      amount: 10,
    }),
  );
  assert.equal(getStore().netObligations.length, 0);
  assert.equal(getStore().ledger.length, 1);

  runNetting();
  assert.equal(getStore().ledger.length, 1);
});

test("FX snapshot change clears derived nets but keeps the ledger", () => {
  seedStore();
  runNetting();
  runRouting();
  const payable = getStore().netObligations.find(
    (o) => o.chosenRail !== "claim_link",
  );
  assert.ok(payable);
  assert.equal(settleObligation(payable.id).success, true);
  getStore().fxAsOf = "stale-date";
  refreshDerivedForFx();
  assert.equal(getStore().netObligations.length, 0);
  assert.equal(getStore().ledger.length, 1);
});

test("adding a traveler also wipes derived nets and invoices", () => {
  seedStore();
  runNetting();
  addEntity(traveler("ent-new", "New", "US", "zelle"));
  assert.equal(getStore().netObligations.length, 0);
  assert.equal(getStore().invoices.length, 0);
  assert.ok(getStore().entities.some((e) => e.id === "ent-new"));
});

test("renaming a traveler keeps nets but updates the balance label", () => {
  seedStore();
  runNetting();
  const nets = getStore().netObligations.length;
  const updated = updateEntity("ent-alice", { name: "Alice T." });
  assert.equal(updated?.name, "Alice T.");
  assert.equal(getStore().netObligations.length, nets);
  assert.ok(
    getStore().nettingSummary?.balances.some(
      (b) => b.entityId === "ent-alice" && b.entityName === "Alice T.",
    ),
  );
});

test("changing a traveler country wipes derived nets", () => {
  seedStore();
  runNetting();
  updateEntity("ent-alice", { country: "US" });
  assert.equal(getStore().netObligations.length, 0);
});

test("linking a rail keeps nets", () => {
  seedStore();
  runNetting();
  const nets = getStore().netObligations.length;
  updateEntity("ent-eve", {
    linkedRailAliases: [{ railType: "PayNow", alias: "+6580009999" }],
  });
  assert.equal(getStore().netObligations.length, nets);
});

test("editing only an expense description keeps nets", () => {
  seedStore();
  runNetting();
  const nets = getStore().netObligations.length;
  const exp = getStore().expenses[0];
  updateExpense(exp.id, { ...exp, description: "Renamed dinner" });
  assert.equal(getStore().netObligations.length, nets);
  assert.equal(
    getStore().expenses.find((e) => e.id === exp.id)?.description,
    "Renamed dinner",
  );
});

test("editing an expense amount recomputes debts and clears nets", () => {
  loadTrip(
    [traveler("a", "A", "US", "zelle"), traveler("b", "B", "US", "zelle")],
    [
      expense({
        id: "e1",
        payerId: "a",
        participantIds: ["a", "b"],
        amount: 40,
      }),
    ],
  );
  runNetting();
  assert.ok(getStore().netObligations.length > 0);
  const exp = getStore().expenses[0];
  updateExpense(exp.id, { ...exp, amount: 80 });
  assert.equal(getStore().netObligations.length, 0);
  assert.equal(getStore().debtEdges[0]?.amountUsd, 40);
});
