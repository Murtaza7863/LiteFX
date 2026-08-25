import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { buildSettlementPlan } from "./plan.js";
import { runNetting } from "./netting.js";
import { runRouting } from "./railRouter.js";
import { clearStore, seedStore, updateEntity } from "../store.js";
import { dropAccount } from "../testUtil.js";

afterEach(() => {
  clearStore();
});

test("plan is empty until netting has run", () => {
  seedStore();
  const plan = buildSettlementPlan();
  assert.match(plan.text, /no netted transfers/i);
  assert.equal(plan.insights.length, 0);
});

test("sample trip has no claim-link insights because everyone has an account", () => {
  seedStore();
  runNetting();
  runRouting();
  const plan = buildSettlementPlan();
  assert.match(plan.text, /Eve Lim/);
  assert.doesNotMatch(plan.text, /claim_link/);
  assert.equal(plan.insights.length, 0);
  assert.match(plan.text, /PayNow/);
  assert.match(plan.text, /settlement plan ·/);
  assert.doesNotMatch(plan.text, / — /);
});

test("a Bahrain payer's claim insight does not treat PayNow as the corridor", () => {
  seedStore();
  dropAccount("ent-eve");
  updateEntity("ent-alice", { country: "BH" });
  runNetting();
  runRouting();
  const plan = buildSettlementPlan();
  const eve = plan.insights.find((i) => i.recipientName === "Eve Lim");
  assert.ok(eve);
  assert.equal(eve.wouldBeRail, "stable_bridge");
  assert.doesNotMatch(eve.message, /would use PayNow/i);
  assert.match(eve.message, /would not pay via PayNow/i);
});
