import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  clearStore,
  getStore,
  seedStore,
  updateEntity,
  updateNetObligation,
} from "../store.js";
import { traveler, assertCorridorsLegal, dropAccount } from "../testUtil.js";
import { runNetting } from "./netting.js";
import {
  getRailTypesExercised,
  runRouting,
  overrideRail,
  linkRecipientAccount,
  ensureLiveSettlement,
} from "./railRouter.js";
import {
  COUNTRIES,
  canonicalizeRail,
  payoutOptionsFor,
  primaryRail,
} from "../data/countries.js";

afterEach(() => {
  clearStore();
});

test("sample trip routing exercises local, linked, and USDC", () => {
  seedStore();
  runNetting();
  const obs = runRouting();
  assert.ok(obs.every((o) => o.status === "routed"));
  const types = new Set(getRailTypesExercised());
  assert.ok(types.has("local"), "TH→TH or SG→SG should be local");
  assert.ok(
    types.has("linked") || types.has("stable_bridge"),
    "cross-border leftovers should be linked or USDC",
  );
  assert.ok(!types.has("claim_link"), "sample crew all have accounts");
});

test("obligation to a recipient with no account is claim_link and marked ineligible on other rails", () => {
  seedStore();
  dropAccount("ent-eve");
  runNetting();
  runRouting();
  const eve = getStore().netObligations.find((o) => o.to === "ent-eve");
  assert.ok(eve);
  assert.equal(eve!.chosenRail, "claim_link");
  assert.ok(eve!.considered?.some((c) => c.type === "claim_link" && c.chosen));
  assert.ok(
    eve!.considered?.some(
      (c) => c.type !== "claim_link" && /no account/i.test(c.note),
    ),
  );
});

test("already-routed obligations are not overwritten", () => {
  seedStore();
  runNetting();
  runRouting();
  const id = getStore().netObligations[0].id;
  updateNetObligation(id, { routingReason: "frozen" });
  runRouting();
  assert.equal(
    getStore().netObligations.find((o) => o.id === id)?.routingReason,
    "frozen",
  );
});

test("DE→US with accounts is USDC, not SEPA", () => {
  clearStore();
  const st = getStore();
  st.entities = [
    traveler("diana", "Diana", "DE", "sepa"),
    traveler("charlie", "Charlie", "US", "zelle"),
  ];
  st.debtEdges = [
    {
      id: "e1",
      from: "diana",
      to: "charlie",
      amount: 100,
      currency: "USD",
      amountUsd: 100,
      sourceExpenseId: "x",
    },
  ];
  runNetting();
  runRouting();
  const ob = getStore().netObligations[0];
  assert.equal(ob.chosenRail, "stable_bridge");
  assert.equal(ob.feeUsd, 1.5);
});

test("overrideRail switches a local transfer onto USDC and raises the fee", () => {
  seedStore();
  runNetting();
  runRouting();
  const local = getStore().netObligations.find((o) => o.chosenRail === "local");
  assert.ok(local);
  const next = overrideRail(local!.id, "USDC Bridge (Circle)");
  assert.equal(next.chosenRail, "stable_bridge");
  assert.equal(next.feeUsd, Math.round(local!.amountUsd * 1.5) / 100);
  assert.match(next.routingReason ?? "", /Manual override/);
});

test("overrideRail rejects a settled transfer", () => {
  seedStore();
  runNetting();
  runRouting();
  const ob = getStore().netObligations.find((o) => o.chosenRail === "local")!;
  updateNetObligation(ob.id, { status: "settled" });
  assert.throws(() => overrideRail(ob.id, "USDC Bridge (Circle)"), /settled/);
});

test("linking a traveler's account re-routes her claim_link onto PayNow without wiping nets", () => {
  seedStore();
  dropAccount("ent-eve");
  runNetting();
  runRouting();
  const before = getStore().netObligations.length;
  const evePay = getStore().netObligations.find((o) => o.to === "ent-eve");
  assert.equal(evePay?.chosenRail, "claim_link");
  const ent = linkRecipientAccount("ent-eve");
  assert.equal(ent.linkedRailAliases[0]?.railType, "PayNow");
  assert.equal(getStore().netObligations.length, before);
  const after = getStore().netObligations.find((o) => o.to === "ent-eve");
  assert.equal(after?.chosenRail, "local");
  assert.equal(after?.feeUsd, 0);
});

function assertBahrainNeverUsesPayNow() {
  assertCorridorsLegal();
  const st = getStore();
  for (const o of st.netObligations) {
    const from = st.entities.find((e) => e.id === o.from);
    const to = st.entities.find((e) => e.id === o.to);
    if (!from || !to) continue;
    if (from.country !== "BH" && to.country !== "BH") continue;
    const chosen = o.considered?.find((c) => c.chosen);
    assert.doesNotMatch(
      chosen?.railName ?? "",
      /PayNow/i,
      `${from.name} (${from.country}) → ${to.name} (${to.country}) chose ${chosen?.railName}`,
    );
    if (from.country === "BH") {
      assert.notEqual(from.linkedRailAliases[0]?.railType, "PayNow");
    }
    if (to.country === "BH") {
      assert.notEqual(to.linkedRailAliases[0]?.railType, "PayNow");
      for (const opt of payoutOptionsFor(to.country)) {
        assert.doesNotMatch(opt, /PayNow/i);
      }
    }
  }
}

test("moving Alice to Bahrain remaps PayNow and never routes BH corridors onto PayNow", () => {
  seedStore();
  updateEntity("ent-alice", { country: "BH" });
  assert.equal(
    getStore().entities.find((e) => e.id === "ent-alice")?.linkedRailAliases[0]
      ?.railType,
    "Fawri+",
  );
  runNetting();
  runRouting();
  assertBahrainNeverUsesPayNow();
});

test("moving Bob to Bahrain never asks a Bahrain payer to use PayNow", () => {
  seedStore();
  updateEntity("ent-bob", { country: "BH" });
  runNetting();
  runRouting();
  assertBahrainNeverUsesPayNow();
});

test("moving Eve to Bahrain remaps PayNow to Fawri+", () => {
  seedStore();
  const eve = updateEntity("ent-eve", { country: "BH" });
  assert.equal(eve?.linkedRailAliases[0]?.railType, "Fawri+");
  runNetting();
  runRouting();
  assertBahrainNeverUsesPayNow();
});

test("moving Alice to any listed country remaps PayNow and only routes legal corridors", () => {
  for (const c of COUNTRIES) {
    seedStore();
    const alice = updateEntity("ent-alice", { country: c.code });
    assert.ok(alice, c.code);
    assert.ok(
      canonicalizeRail(c.code, alice.linkedRailAliases[0]?.railType),
      `${c.code} kept ${alice.linkedRailAliases[0]?.railType}`,
    );
    if (c.code !== "SG") {
      assert.equal(alice.linkedRailAliases[0]?.railType, primaryRail(c.code));
    }
    runNetting();
    runRouting();
    assertCorridorsLegal();
    clearStore();
  }
});

test("moving Eve to any listed country remaps her rail and stays legal", () => {
  for (const c of COUNTRIES) {
    seedStore();
    const eve = updateEntity("ent-eve", { country: c.code });
    assert.ok(eve, c.code);
    assert.ok(
      canonicalizeRail(c.code, eve.linkedRailAliases[0]?.railType),
      `${c.code} kept ${eve.linkedRailAliases[0]?.railType}`,
    );
    if (c.code !== "SG") {
      assert.equal(eve.linkedRailAliases[0]?.railType, primaryRail(c.code));
    }
    runNetting();
    runRouting();
    assertCorridorsLegal();
    clearStore();
  }
});

test("ensureLiveSettlement nets only when debts exist and the trip is unrouted", () => {
  seedStore();
  assert.equal(getStore().netObligations.length, 0);
  assert.equal(ensureLiveSettlement(), true);
  assert.ok(getStore().netObligations.length > 0);
  assert.ok(
    getStore().netObligations.every(
      (o) => o.status === "routed" && o.chosenRail,
    ),
  );
  assert.equal(ensureLiveSettlement(), false);
  assert.equal(getStore().ledger.length, 0);
});
