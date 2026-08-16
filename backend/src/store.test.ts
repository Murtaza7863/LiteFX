import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  addEntityFromContact,
  addExpense,
  addEntity,
  deleteEntity,
  deleteExpense,
  createTraveler,
  createTrip,
  currentTripSummary,
  deleteContact,
  deleteTrip,
  duplicateTrip,
  getStore,
  listContacts,
  listTripSummaries,
  loadSampleTrip,
  normalizeApp,
  refreshDerivedForFx,
  renameTrip,
  resetApp,
  saveTripCrew,
  seedStore,
  selectTrip,
  updateEntity,
  updateExpense,
  withClaimTrip,
} from "./store.js";
import { expense, loadTrip, traveler, dropAccount } from "./testUtil.js";
import { runNetting } from "./agents/netting.js";
import { linkRecipientAccount, runRouting } from "./agents/railRouter.js";
import { settleObligation, claimWithPayoutMethod } from "./agents/claimLink.js";

afterEach(() => {
  resetApp();
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

test("changing a traveler country remaps leftover rails and wipes derived nets", () => {
  seedStore();
  runNetting();
  const alice = updateEntity("ent-alice", { country: "BH" });
  assert.equal(alice?.country, "BH");
  assert.equal(alice?.linkedRailAliases[0]?.railType, "Fawri+");
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

test("named trips stay isolated and claim links follow the source trip", () => {
  seedStore();
  dropAccount("ent-eve");
  runNetting();
  runRouting();
  const bangkok = currentTripSummary();
  assert.equal(bangkok.name, "Bangkok Trip 2026");
  const claimOb = getStore().netObligations.find(
    (o) => o.chosenRail === "claim_link",
  );
  assert.ok(claimOb);
  const issued = settleObligation(claimOb.id);
  assert.ok(issued.link?.token);

  const created = createTrip("Tokyo 2026");
  assert.equal("id" in created, true);
  assert.equal(getStore().entities.length, 0);
  assert.equal(getStore().claimLinks.length, 0);
  assert.equal(listTripSummaries().length, 2);

  const claimed = withClaimTrip(issued.link.token, () => getStore());
  assert.ok(claimed);
  assert.equal(claimed.entities.length, 6);
  assert.ok(claimed.claimLinks.some((c) => c.token === issued.link?.token));
  assert.equal(getStore().id, (created as { id: string }).id);

  const tokyoStamp = currentTripSummary().updatedAt;
  const paid = withClaimTrip(issued.link.token, () =>
    claimWithPayoutMethod(issued.link.token, "GrabPay"),
  );
  assert.equal(paid?.success, true);
  assert.equal(currentTripSummary().updatedAt, tokyoStamp);
  assert.equal(getStore().ledger.length, 0);

  assert.equal(selectTrip(bangkok.id), true);
  assert.equal(getStore().entities.length, 6);
  assert.equal(getStore().ledger.length, 1);
  const renamed = renameTrip(bangkok.id, "Bangkok with friends");
  assert.equal("error" in renamed, false);
  assert.equal(currentTripSummary().name, "Bangkok with friends");
  assert.equal("ok" in deleteTrip((created as { id: string }).id), true);
  assert.equal(listTripSummaries().length, 1);
  assert.equal("error" in deleteTrip(bangkok.id), true);
});

test("loading the sample as a new trip keeps the one you were editing", () => {
  seedStore();
  assert.equal(getStore().expenses[0]?.tripId, getStore().id);
  const first = currentTripSummary();
  const again = loadSampleTrip();
  assert.equal("error" in again, false);
  assert.equal(listTripSummaries().length, 2);
  assert.notEqual((again as { id: string }).id, first.id);
  assert.match((again as { name: string }).name, /Bangkok Trip 2026/);
  assert.equal(selectTrip(first.id), true);
  assert.equal(getStore().entities.length, 6);

  const extra = createTrip("New trip");
  assert.equal((extra as { name: string }).name, "New trip");
  const extra2 = createTrip("New trip");
  assert.equal((extra2 as { name: string }).name, "New trip (2)");
});

test("travelers are saved as contacts and can be added to a later trip", () => {
  const added = createTraveler({
    id: "ent-sam",
    name: "Sam",
    country: "US",
    contact: { type: "email", value: "sam@x.test" },
    linkedRailAliases: [{ railType: "Zelle", alias: "sam" }],
  });
  assert.equal("id" in added, true);
  assert.equal(listContacts().length, 1);
  const dup = createTraveler({
    id: "ent-sam-2",
    name: "Sam",
    country: "US",
    contact: { type: "email", value: "sam@x.test" },
    linkedRailAliases: [],
  });
  assert.equal("error" in dup, true);

  createTrip("Next weekend");
  assert.equal(getStore().entities.length, 0);
  const fromBook = addEntityFromContact(listContacts()[0].id);
  assert.equal("id" in fromBook, true);
  assert.equal((fromBook as { name: string }).name, "Sam");
  assert.equal(getStore().entities.length, 1);
  assert.equal(deleteContact(listContacts()[0].id), true);
  assert.equal(listContacts().length, 0);
  assert.equal(getStore().entities[0].name, "Sam");
});

test("duplicate trip copies people and expenses but not nets", () => {
  seedStore();
  runNetting();
  const srcId = getStore().id;
  const copy = duplicateTrip(srcId);
  assert.equal("error" in copy, false);
  assert.match(getStore().name, /copy/i);
  assert.equal(getStore().entities.length, 6);
  assert.equal(getStore().expenses.length > 0, true);
  assert.equal(getStore().netObligations.length, 0);
  assert.notEqual(getStore().id, srcId);
});

test("duplicate trip remaps custom split parts and clips long names", () => {
  const long = "T".repeat(80);
  const renamed = renameTrip(getStore().id, long);
  assert.equal("error" in renamed, false);
  addEntity(traveler("a", "Ada", "US"));
  addEntity(traveler("b", "Ben", "SG"));
  addExpense(
    expense({
      id: "e-split",
      payerId: "a",
      participantIds: ["a", "b"],
      amount: 100,
      split: { mode: "percent", parts: { a: 40, b: 60 } },
    }),
  );
  const copy = duplicateTrip();
  assert.equal("error" in copy, false);
  const dest = copy as {
    name: string;
    expenses: { split?: { parts?: Record<string, number> } }[];
    entities: { id: string }[];
  };
  assert.ok(dest.name.length <= 80);
  assert.match(dest.name, /copy/i);
  const parts = dest.expenses[0]?.split?.parts ?? {};
  assert.equal(Object.keys(parts).includes("a"), false);
  assert.equal(
    Object.values(parts).reduce((s, n) => s + n, 0),
    100,
  );
});

test("a full contact book still lets you add a traveler to the trip", () => {
  for (let i = 0; i < 80; i++) {
    const added = createTraveler({
      id: `ent-fill-${i}`,
      name: `Person ${i}`,
      country: "US",
      contact: { type: "email", value: `p${i}@x.test` },
      linkedRailAliases: [],
    });
    assert.equal("id" in added, true, `failed at ${i}`);
  }
  assert.equal(listContacts().length, 80);
  const extra = createTraveler({
    id: "ent-extra",
    name: "Extra",
    country: "US",
    contact: { type: "email", value: "extra@x.test" },
    linkedRailAliases: [],
  });
  assert.equal("id" in extra, true);
  assert.equal(listContacts().length, 80);
  assert.equal(
    getStore().entities.some((e) => e.name === "Extra"),
    true,
  );
});

test("linking a traveler saves them with the new rail for later trips", () => {
  seedStore();
  assert.equal(listContacts().length, 0);
  const eve = linkRecipientAccount("ent-eve");
  assert.equal(eve.linkedRailAliases[0]?.railType, "PayNow");
  assert.ok(eve.contactId);
  assert.equal(listContacts().length, 1);
  assert.equal(listContacts()[0].linkedRailAliases[0]?.railType, "PayNow");

  createTrip("Next weekend");
  const added = addEntityFromContact(listContacts()[0].id);
  assert.equal("id" in added, true);
  assert.equal(
    (added as { linkedRailAliases: { railType: string }[] })
      .linkedRailAliases[0]?.railType,
    "PayNow",
  );
});

test("saveTripCrew remembers the sample people without duplicating", () => {
  seedStore();
  const first = saveTripCrew();
  assert.equal(first.length, 6);
  assert.equal(saveTripCrew().length, 6);
  assert.ok(getStore().entities.every((e) => e.contactId));
});

test("normalizeApp migrates a v2 single-trip file", () => {
  const migrated = normalizeApp({
    version: 2,
    users: [],
    sessions: [],
    trips: {
      "user-local": {
        entities: [{ id: "a", name: "Ada", country: "US" }],
        expenses: [
          {
            id: "e1",
            payerId: "a",
            participantIds: ["a"],
            amount: 10,
            currency: "USD",
            tripId: "t",
            category: "food",
            description: "Pad thai in Bangkok",
          },
        ],
      },
    },
  });
  assert.ok(migrated);
  const ws = migrated.workspaces["user-local"];
  const trip = Object.values(ws.trips)[0];
  assert.equal(trip.name, "Bangkok Trip 2026");
  assert.equal(trip.entities.length, 1);
});

test("normalizeApp restores Eve's PayNow on an old sample trip once", () => {
  const raw = {
    version: 3 as const,
    users: [],
    sessions: [],
    workspaces: {
      "user-local": {
        activeTripId: "t1",
        trips: {
          t1: {
            id: "t1",
            name: "Bangkok Trip 2026",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            entities: [
              {
                id: "ent-alice",
                name: "Alice Tan",
                country: "SG",
                contact: { type: "phone", value: "+65-9000-1111" },
                linkedRailAliases: [
                  { railType: "PayNow", alias: "+6590001111" },
                ],
              },
              {
                id: "ent-eve",
                name: "Eve Lim",
                country: "SG",
                contact: { type: "phone", value: "+65-8000-9999" },
                linkedRailAliases: [],
              },
            ],
            expenses: [],
            netObligations: [
              {
                id: "n1",
                from: "ent-alice",
                to: "ent-eve",
                amountUsd: 10,
                amount: 13,
                settlementCurrency: "SGD",
                status: "routed",
                chosenRail: "claim_link",
              },
            ],
          },
        },
        contacts: [],
      },
    },
  };
  const first = normalizeApp(raw);
  assert.ok(first);
  const trip = first.workspaces["user-local"].trips.t1;
  assert.equal(
    trip.entities.find((e) => e.id === "ent-eve")?.linkedRailAliases[0]
      ?.railType,
    "PayNow",
  );
  assert.equal(trip.netObligations.length, 0);
  assert.equal(first.sampleAccounts, 1);

  trip.entities.find((e) => e.id === "ent-eve")!.linkedRailAliases = [];
  const second = normalizeApp(first);
  assert.equal(
    second?.workspaces["user-local"].trips.t1.entities.find(
      (e) => e.id === "ent-eve",
    )?.linkedRailAliases.length,
    0,
  );
});
