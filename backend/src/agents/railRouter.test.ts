import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  clearStore,
  getStore,
  seedStore,
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
