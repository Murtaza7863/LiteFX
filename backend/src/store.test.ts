import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  addExpense,
  addEntity,
  clearStore,
  deleteEntity,
  deleteExpense,
  getStore,
  seedStore,
} from "./store.js";
import { expense, loadTrip, traveler } from "./testUtil.js";
import { runNetting } from "./agents/netting.js";

afterEach(() => {
  clearStore();
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

test("deleting a traveler drops their expenses and IOUs", () => {
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
  assert.equal(deleteEntity("b"), true);
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

test("adding a traveler also wipes derived nets and invoices", () => {
  seedStore();
  runNetting();
  addEntity(traveler("ent-new", "New", "US", "zelle"));
  assert.equal(getStore().netObligations.length, 0);
  assert.equal(getStore().invoices.length, 0);
  assert.ok(getStore().entities.some((e) => e.id === "ent-new"));
});
