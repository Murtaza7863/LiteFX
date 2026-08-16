import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  clearStore,
  getStore,
  seedStore,
  updateEntity,
  updateNetObligation,
} from "../store.js";
import { traveler } from "../testUtil.js";
import { runNetting } from "./netting.js";
import {
  getRailTypesExercised,
  runRouting,
  overrideRail,
  linkRecipientAccount,
} from "./railRouter.js";
import {
  COUNTRIES,
  LINKED_CORRIDORS,
  canonicalizeRail,
  linkedKey,
  payoutOptionsFor,
  primaryRail,
  sharedLocalRail,
} from "../data/countries.js";

afterEach(() => {
  clearStore();
});

test("sample trip routing exercises claim_link, local, and a priced rail", () => {
  seedStore();
  runNetting();
  const obs = runRouting();
  assert.ok(obs.every((o) => o.status === "routed"));
  const types = new Set(getRailTypesExercised());
  assert.ok(types.has("claim_link"), "Eve has no account");
  assert.ok(types.has("local"), "TH→TH should be local");
  assert.ok(
    types.has("linked") || types.has("stable_bridge"),
    "cross-border leftovers should be linked or USDC",
  );
});

test("obligation to a recipient with no account is claim_link and marked ineligible on other rails", () => {
  seedStore();
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

test("linking Eve's account re-routes her claim_link onto PayNow without wiping nets", () => {
  seedStore();
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

function assertCorridorsLegal() {
  const st = getStore();
  for (const e of st.entities) {
    for (const a of e.linkedRailAliases) {
      assert.ok(
        canonicalizeRail(e.country, a.railType),
        `${e.name} in ${e.country} still linked to ${a.railType}`,
      );
    }
  }
  for (const o of st.netObligations) {
    const from = st.entities.find((e) => e.id === o.from);
    const to = st.entities.find((e) => e.id === o.to);
    assert.ok(from && to, o.id);
    if (o.chosenRail === "local") {
      assert.ok(
        sharedLocalRail(from.country, to.country),
        `local ${from.country}→${to.country}`,
      );
    }
    if (o.chosenRail === "linked") {
      assert.ok(
        LINKED_CORRIDORS[linkedKey(from.country, to.country)],
        `linked ${from.country}→${to.country}`,
      );
    }
    const chosen = o.considered?.find((c) => c.chosen);
    if (chosen?.type === "local") {
      assert.ok(sharedLocalRail(from.country, to.country), chosen.railName);
    }
    if (chosen?.type === "linked") {
      assert.ok(
        LINKED_CORRIDORS[linkedKey(from.country, to.country)],
        chosen.railName,
      );
    }
  }
}

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

test("moving Eve to Bahrain offers Fawri+ claim payouts, not PayNow", () => {
  seedStore();
  updateEntity("ent-eve", { country: "BH" });
  runNetting();
  runRouting();
  assertBahrainNeverUsesPayNow();
  const eve = getStore().netObligations.find((o) => o.to === "ent-eve");
  assert.equal(eve?.chosenRail, "claim_link");
  const opts = payoutOptionsFor("BH");
  assert.ok(opts.some((o) => /Fawri/i.test(o)));
  assert.ok(!opts.some((o) => /PayNow/i.test(o)));
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
    const evePay = getStore().netObligations.find((o) => o.to === "ent-eve");
    if (evePay?.chosenRail === "claim_link") {
      const opts = payoutOptionsFor("SG");
      assert.ok(opts.some((o) => /PayNow/i.test(o)));
    }
    clearStore();
  }
});

test("moving Eve to any listed country offers that country's payouts, not leftover PayNow", () => {
  for (const c of COUNTRIES) {
    seedStore();
    updateEntity("ent-eve", { country: c.code });
    runNetting();
    runRouting();
    assertCorridorsLegal();
    const eve = getStore().netObligations.find((o) => o.to === "ent-eve");
    assert.equal(eve?.chosenRail, "claim_link", c.code);
    const opts = payoutOptionsFor(c.code);
    assert.ok(
      opts.some((o) => o.includes(primaryRail(c.code))),
      `${c.code} missing ${primaryRail(c.code)}`,
    );
    if (c.code !== "SG") {
      assert.ok(
        !opts.some((o) => /PayNow/i.test(o)),
        `${c.code} still offered PayNow`,
      );
    }
    clearStore();
  }
});
