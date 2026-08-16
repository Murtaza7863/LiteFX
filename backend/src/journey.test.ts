import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyExpense } from "./data/classifyExpense.js";
import { runNetting } from "./agents/netting.js";
import {
  linkRecipientAccount,
  overrideRail,
  runRouting,
} from "./agents/railRouter.js";
import { settleObligation } from "./agents/claimLink.js";
import {
  addExpense,
  getStore,
  resetApp,
  runAsUser,
  seedStore,
} from "./store.js";
import { expense } from "./testUtil.js";

test("judge path: classify, net, override, link, settle, keep history", () => {
  resetApp();
  runAsUser("judge", () => {
    seedStore();
    assert.equal(classifyExpense("Grab to the airport").category, "transport");
    addExpense({
      ...expense({
        id: "exp-live",
        payerId: "ent-alice",
        participantIds: ["ent-alice", "ent-bob"],
        amount: 24,
      }),
      description: "Grab to the airport",
      category: classifyExpense("Grab to the airport").category,
    });

    const netting = runNetting();
    assert.ok(netting.netEdgeCount > 0);
    assert.ok(netting.netEdgeCount < netting.rawEdgeCount);
    const routed = runRouting();
    assert.ok(routed.every((o) => o.status === "routed"));

    const local = getStore().netObligations.find(
      (o) => o.chosenRail === "local",
    );
    assert.ok(local);
    const switched = overrideRail(local.id, "USDC Bridge (Circle)");
    assert.equal(switched.chosenRail, "stable_bridge");

    const eve = linkRecipientAccount("ent-eve");
    assert.equal(eve.linkedRailAliases[0]?.railType, "PayNow");
    const evePay = getStore().netObligations.find((o) => o.to === "ent-eve");
    assert.equal(evePay?.chosenRail, "local");

    const payable = getStore().netObligations.find(
      (o) => o.chosenRail !== "claim_link" && o.status === "routed",
    );
    assert.ok(payable);
    assert.equal(settleObligation(payable.id).success, true);
    assert.ok(getStore().ledger.length >= 1);

    const history = getStore().ledger.length;
    addExpense({
      ...expense({
        id: "exp-after",
        payerId: "ent-alice",
        participantIds: ["ent-alice", "ent-bob"],
        amount: 8,
      }),
      description: "Dinner",
      category: "food",
    });
    assert.equal(getStore().netObligations.length, 0);
    assert.equal(getStore().ledger.length, history);
  });
});
