import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyExpense } from "../../../backend/src/data/classifyExpense.ts";
import { paymentSlip } from "./paymentSlip.ts";
import type { Entity, NetObligation } from "../api/client.ts";
import {
  COUNTRIES,
  LINKED_CORRIDORS,
  linkedKey,
  primaryRail,
  sharedLocalRail,
} from "../../../backend/src/data/countries.ts";

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

test("impossible local/linked corridors never instruct a foreign domestic rail", () => {
  for (const c of COUNTRIES) {
    const sender: Entity = {
      id: "ent-bob",
      name: "Bob Sukhum",
      country: c.code,
      contact: { type: "phone", value: "+1000" },
      linkedRailAliases: [{ railType: primaryRail(c.code), alias: "bob" }],
    };
    const local = paymentSlip(
      obligation({ chosenRail: "local", from: sender.id, to: alice.id }),
      sender,
      alice,
    );
    const linked = paymentSlip(
      obligation({ chosenRail: "linked", from: sender.id, to: alice.id }),
      sender,
      alice,
    );
    const localName = sharedLocalRail(c.code, "SG");
    const linkedName = LINKED_CORRIDORS[linkedKey(c.code, "SG")];
    if (localName) {
      assert.match(
        local.text,
        new RegExp(localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
    } else {
      assert.match(local.text, /USDC/i, c.code);
      assert.doesNotMatch(local.text, /via PayNow/i, c.code);
    }
    if (linkedName) {
      assert.match(
        linked.text,
        new RegExp(linkedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
    } else {
      assert.match(linked.text, /USDC/i, c.code);
      assert.doesNotMatch(linked.text, /via PayNow/i, c.code);
    }
  }
});
