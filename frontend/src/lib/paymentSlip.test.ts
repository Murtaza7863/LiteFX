import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyExpense } from "../../../backend/src/data/classifyExpense.ts";
import { paymentSlip } from "./paymentSlip.ts";
import type { Entity, NetObligation } from "../api/client.ts";

const alice: Entity = {
  id: "ent-alice",
  name: "Alice Tan",
  country: "SG",
  contact: { type: "email", value: "alice@x.test" },
  linkedRailAliases: [{ railType: "PayNow", alias: "+65alice" }],
};
const eve: Entity = {
  id: "ent-eve",
  name: "Eve Lim",
  country: "SG",
  contact: { type: "email", value: "eve@x.test" },
  linkedRailAliases: [],
};

function obligation(partial: Partial<NetObligation>): NetObligation {
  return {
    id: "net-1",
    from: alice.id,
    to: eve.id,
    amount: 41.7,
    settlementCurrency: "SGD",
    amountUsd: 31.2,
    status: "routed",
    ...partial,
  };
}

test("live titles classify the same way the form does", () => {
  assert.equal(classifyExpense("Grab to the airport").category, "transport");
  assert.equal(classifyExpense("Dinner at hawker").category, "food");
  assert.equal(classifyExpense("par").category, "general");
});

test("payment slips name the rail, alias, and claim path", () => {
  const local = paymentSlip(
    obligation({
      to: alice.id,
      chosenRail: "local",
    }),
    eve,
    alice,
  );
  assert.match(local.text, /PayNow/);
  assert.match(local.text, /\+65alice/);

  const claim = paymentSlip(
    obligation({ chosenRail: "claim_link" }),
    alice,
    eve,
  );
  assert.match(claim.text, /claim link/i);
});
