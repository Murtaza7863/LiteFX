import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { buildSettlementPlan } from "./plan.js";
import { runNetting } from "./netting.js";
import { runRouting } from "./railRouter.js";
import { clearStore, seedStore } from "../store.js";

afterEach(() => {
  clearStore();
});

test("plan is empty until netting has run", () => {
  seedStore();
  const plan = buildSettlementPlan();
  assert.match(plan.text, /no netted transfers/i);
  assert.equal(plan.insights.length, 0);
});

test("sample trip suggests linking Eve's PayNow to skip the claim link", () => {
  seedStore();
  runNetting();
  runRouting();
  const plan = buildSettlementPlan();
  assert.match(plan.text, /Eve Lim/);
  assert.match(plan.text, /claim_link/);
  const eve = plan.insights.find((i) => i.recipientName === "Eve Lim");
  assert.ok(eve);
  assert.match(eve.suggestedRail, /paynow/i);
  assert.equal(eve.wouldBeRail, "local");
  assert.ok(eve.savingsUsd > 0);
});
