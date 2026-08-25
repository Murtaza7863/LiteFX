import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyExpense } from "../../../backend/src/data/classifyExpense.ts";
import { allSendSlips, paymentSlip, railSummary } from "./paymentSlip.ts";
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

test("railSummary prefers the chosen considered row", () => {
  const pick = railSummary(
    obligation({
      chosenRail: "local",
      feeUsd: 0,
      considered: [
        {
          type: "local",
          railName: "PayNow",
          feeEstimatePct: 0,
          timeEstimateHours: 0,
          chosen: true,
          note: "same country",
        },
        {
          type: "stable_bridge",
          railName: "USDC Bridge (Circle)",
          feeEstimatePct: 1.5,
          timeEstimateHours: 24,
          chosen: false,
          note: "fallback",
        },
      ],
    }),
  );
  assert.equal(pick.name, "PayNow");
  assert.equal(pick.feePct, 0);
  assert.equal(pick.feeUsd, 0);
});

test("allSendSlips joins each transfer", () => {
  const text = allSendSlips(
    [
      obligation({ to: alice.id, chosenRail: "local" }),
      obligation({ chosenRail: "claim_link" }),
    ],
    (id) => (id === alice.id ? alice : eve),
  );
  assert.match(text, /PayNow/);
  assert.match(text, /claim link/i);
  assert.equal(text.split("\n\n").length, 2);
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

test("send slip uses the alias for the chosen rail, not the first one", () => {
  const recipient: Entity = {
    ...alice,
    linkedRailAliases: [
      { railType: "PayNow", alias: "+65alice" },
      { railType: "FAST", alias: "001-123456" },
    ],
  };
  const slip = paymentSlip(
    obligation({
      to: recipient.id,
      chosenRail: "local",
      considered: [
        {
          type: "local",
          railName: "FAST",
          feeEstimatePct: 0,
          timeEstimateHours: 1,
          chosen: true,
          note: "bank",
        },
      ],
    }),
    eve,
    recipient,
  );
  assert.match(slip.text, /FAST/);
  assert.match(slip.text, /001-123456/);
  assert.doesNotMatch(slip.text, /\+65alice/);
});

test("impossible local/linked corridors never instruct a foreign domestic rail", () => {
  for (const from of COUNTRIES) {
    for (const to of COUNTRIES) {
      const sender: Entity = {
        id: "ent-from",
        name: "From",
        country: from.code,
        contact: { type: "phone", value: "+1000" },
        linkedRailAliases: [
          { railType: primaryRail(from.code), alias: "from" },
        ],
      };
      const recipient: Entity = {
        id: "ent-to",
        name: "To",
        country: to.code,
        contact: { type: "phone", value: "+2000" },
        linkedRailAliases: [{ railType: primaryRail(to.code), alias: "to" }],
      };
      const base = obligation({
        from: sender.id,
        to: recipient.id,
      });
      const local = paymentSlip(
        { ...base, chosenRail: "local" },
        sender,
        recipient,
      );
      const linked = paymentSlip(
        { ...base, chosenRail: "linked" },
        sender,
        recipient,
      );
      const usdc = paymentSlip(
        { ...base, chosenRail: "stable_bridge" },
        sender,
        recipient,
      );
      const claim = paymentSlip(
        {
          ...base,
          chosenRail: "claim_link",
        },
        sender,
        { ...recipient, linkedRailAliases: [] },
      );
      const localName = sharedLocalRail(from.code, to.code);
      const linkedName = LINKED_CORRIDORS[linkedKey(from.code, to.code)];
      if (localName) {
        assert.match(
          local.text,
          new RegExp(localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
          `${from.code}→${to.code} local`,
        );
      } else {
        assert.match(local.text, /USDC/i, `${from.code}→${to.code} local`);
      }
      if (linkedName) {
        assert.match(
          linked.text,
          new RegExp(linkedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
          `${from.code}→${to.code} linked`,
        );
      } else {
        assert.match(linked.text, /USDC/i, `${from.code}→${to.code} linked`);
      }
      assert.match(usdc.text, /USDC/i, `${from.code}→${to.code}`);
      assert.match(claim.text, /claim link/i, `${from.code}→${to.code}`);
      assert.match(claim.text, new RegExp(`\\(${from.code}\\)`));
      assert.match(claim.text, new RegExp(`\\(${to.code}\\)`));
    }
  }
});
