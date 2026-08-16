import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  COUNTRIES,
  LINKED_CORRIDORS,
  SEPA_COUNTRIES,
  alignRailsToCountry,
  canonicalizeRail,
  linkedKey,
  payoutOptionsFor,
  primaryRail,
  railsFor,
  sharedLocalRail,
} from "./data/countries.js";
import { cheapestRail as pickRail } from "./data/railOptions.js";
import { SEED_ENTITIES } from "./data/seed.js";
import { EXPENSE_CATEGORY_IDS } from "./data/classifyExpense.js";
import { claimWithPayoutMethod, settleObligation } from "./agents/claimLink.js";
import { runNetting } from "./agents/netting.js";
import {
  linkRecipientAccount,
  overrideRail,
  rebuildSettlement,
  rerouteUnsettled,
  runRouting,
} from "./agents/railRouter.js";
import {
  clearStore,
  deleteEntity,
  deleteExpense,
  getStore,
  seedStore,
  updateEntity,
  updateExpense,
} from "./store.js";
import {
  assertCorridorsLegal,
  expense,
  loadTrip,
  traveler,
} from "./testUtil.js";

afterEach(() => {
  clearStore();
});

test("every sample traveler × every country rebuilds a legal graph", () => {
  for (const person of SEED_ENTITIES) {
    for (const c of COUNTRIES) {
      seedStore();
      runNetting();
      runRouting();
      updateEntity(person.id, { country: c.code });
      rebuildSettlement();
      const ent = getStore().entities.find((e) => e.id === person.id);
      assert.equal(ent?.country, c.code, person.name);
      if (person.linkedRailAliases.length > 0) {
        assert.ok(
          canonicalizeRail(c.code, ent?.linkedRailAliases[0]?.railType),
          `${person.name} → ${c.code} kept ${ent?.linkedRailAliases[0]?.railType}`,
        );
      }
      assertCorridorsLegal(`${person.name}→${c.code}`);
      clearStore();
    }
  }
});

test("every listed country pair with an account is a legal local, linked, or USDC pick", () => {
  for (const a of COUNTRIES) {
    for (const b of COUNTRIES) {
      const pick = pickRail(a.code, b.code, true);
      if (pick.type === "local") {
        assert.equal(
          pick.railName,
          sharedLocalRail(a.code, b.code),
          `${a.code}→${b.code}`,
        );
      } else if (pick.type === "linked") {
        assert.equal(
          pick.railName,
          LINKED_CORRIDORS[linkedKey(a.code, b.code)],
          `${a.code}→${b.code}`,
        );
      } else {
        assert.equal(pick.type, "stable_bridge", `${a.code}→${b.code}`);
      }
      assert.equal(pickRail(a.code, b.code, false).type, "claim_link");
      if (
        a.code !== b.code &&
        SEPA_COUNTRIES.has(a.code) &&
        SEPA_COUNTRIES.has(b.code)
      ) {
        assert.equal(pick.type, "local", `SEPA ${a.code}→${b.code}`);
        assert.equal(pick.railName, "SEPA Instant");
      }
    }
  }
});

test("every domestic rail can be linked on that country", () => {
  for (const c of COUNTRIES) {
    for (const rail of railsFor(c.code)) {
      assert.equal(canonicalizeRail(c.code, rail), rail, `${c.code} ${rail}`);
    }
  }
});

test("two people in any country settle locally on that country's primary rail", () => {
  for (const c of COUNTRIES) {
    const rail = primaryRail(c.code);
    loadTrip(
      [traveler("a", "A", c.code, rail), traveler("b", "B", c.code, rail)],
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
    runRouting();
    const ob = getStore().netObligations.find(
      (o) => o.from === "b" && o.to === "a",
    );
    assert.ok(ob, c.code);
    assert.equal(ob?.chosenRail, "local", c.code);
    assert.equal(
      ob?.considered?.find((r) => r.chosen)?.railName,
      sharedLocalRail(c.code, c.code),
      c.code,
    );
    assertCorridorsLegal(c.code);
    clearStore();
  }
});

test("every linked corridor is the pick when both ends have accounts", () => {
  for (const [key, name] of Object.entries(LINKED_CORRIDORS)) {
    const [a, b] = key.split("-");
    loadTrip(
      [
        traveler("from", "From", a, primaryRail(a)),
        traveler("to", "To", b, primaryRail(b)),
      ],
      [
        expense({
          id: "e1",
          payerId: "to",
          participantIds: ["from", "to"],
          amount: 50,
        }),
      ],
    );
    runNetting();
    runRouting();
    const ob = getStore().netObligations.find((o) => o.from === "from");
    assert.equal(ob?.chosenRail, "linked", key);
    assert.equal(ob?.considered?.find((r) => r.chosen)?.railName, name, key);
    assertCorridorsLegal(key);
    clearStore();
  }
});

test("claim payouts for every country accept every listed option", () => {
  for (const c of COUNTRIES) {
    const opts = payoutOptionsFor(c.code);
    assert.ok(opts.length >= 3, c.code);
    for (const opt of opts) {
      loadTrip(
        [
          traveler("payer", "Payer", "US", "Zelle"),
          traveler("recv", "Recv", c.code),
        ],
        [
          expense({
            id: "e1",
            payerId: "recv",
            participantIds: ["payer", "recv"],
            amount: 30,
          }),
        ],
      );
      runNetting();
      runRouting();
      const ob = getStore().netObligations.find((o) => o.to === "recv");
      assert.equal(ob?.chosenRail, "claim_link", `${c.code} ${opt}`);
      const settled = settleObligation(ob!.id);
      assert.equal(settled.success, true, `${c.code} ${opt}`);
      const claimed = claimWithPayoutMethod(settled.link!.token, opt);
      assert.equal(
        claimed.success,
        true,
        `${c.code} ${opt}: ${claimed.message}`,
      );
      clearStore();
    }
  }
});

test("linking an account in every country uses that country's primary rail", () => {
  for (const c of COUNTRIES) {
    loadTrip(
      [
        traveler("payer", "Payer", c.code, primaryRail(c.code)),
        traveler("recv", "Recv", c.code),
      ],
      [
        expense({
          id: "e1",
          payerId: "recv",
          participantIds: ["payer", "recv"],
          amount: 20,
        }),
      ],
    );
    runNetting();
    runRouting();
    assert.equal(
      getStore().netObligations.find((o) => o.to === "recv")?.chosenRail,
      "claim_link",
      c.code,
    );
    const ent = linkRecipientAccount("recv");
    assert.equal(
      ent.linkedRailAliases[0]?.railType,
      primaryRail(c.code),
      c.code,
    );
    const after = getStore().netObligations.find((o) => o.to === "recv");
    assert.equal(after?.chosenRail, "local", c.code);
    assertCorridorsLegal(`link-${c.code}`);
    clearStore();
  }
});

test("every eligible Try another rail override on the sample trip stays legal", () => {
  seedStore();
  runNetting();
  runRouting();
  const combos: { from: string; to: string; railName: string }[] = [];
  for (const ob of getStore().netObligations) {
    for (const row of (ob.considered ?? []).filter((r) => r.eligible)) {
      combos.push({ from: ob.from, to: ob.to, railName: row.railName });
    }
  }
  assert.ok(combos.length > 0);
  for (const combo of combos) {
    seedStore();
    runNetting();
    runRouting();
    const ob = getStore().netObligations.find(
      (o) => o.from === combo.from && o.to === combo.to,
    );
    assert.ok(ob, `${combo.from}→${combo.to}`);
    overrideRail(ob!.id, combo.railName);
    assertCorridorsLegal(
      `override ${combo.from}→${combo.to} ${combo.railName}`,
    );
    clearStore();
  }
});

test("expense categories and split modes still net and route", () => {
  const modes = [
    { mode: "equal" as const, parts: undefined },
    { mode: "percent" as const, parts: { a: 50, b: 50 } },
    { mode: "amount" as const, parts: { a: 10, b: 10 } },
  ];
  for (const category of EXPENSE_CATEGORY_IDS) {
    for (const split of modes) {
      loadTrip(
        [
          traveler("a", "A", "US", "zelle"),
          traveler("b", "B", "TH", "promptpay"),
        ],
        [
          {
            ...expense({
              id: "e1",
              payerId: "a",
              participantIds: ["a", "b"],
              amount: 20,
              split: split.parts
                ? { mode: split.mode, parts: split.parts }
                : undefined,
            }),
            category,
            description: `${category} ${split.mode}`,
          },
        ],
      );
      runNetting();
      runRouting();
      assert.ok(
        getStore().netObligations.length > 0,
        `${category} ${split.mode}`,
      );
      assertCorridorsLegal(`${category} ${split.mode}`);
      const exp = getStore().expenses[0];
      updateExpense(exp.id, { ...exp, amount: 24 });
      assert.equal(getStore().netObligations.length, 0);
      runNetting();
      runRouting();
      assertCorridorsLegal(`${category} ${split.mode} after edit`);
      clearStore();
    }
  }
});

test("moving two sample people to every linked-corridor pair stays legal", () => {
  for (const key of Object.keys(LINKED_CORRIDORS)) {
    const [a, b] = key.split("-");
    seedStore();
    runNetting();
    runRouting();
    updateEntity("ent-alice", { country: a });
    updateEntity("ent-bob", { country: b });
    rebuildSettlement();
    assert.equal(
      getStore().entities.find((e) => e.id === "ent-alice")?.country,
      a,
    );
    assert.equal(
      getStore().entities.find((e) => e.id === "ent-bob")?.country,
      b,
    );
    assertCorridorsLegal(`pair ${key}`);
    clearStore();
  }
});

test("moving the whole sample crew to any one country stays local or claim", () => {
  for (const c of COUNTRIES) {
    seedStore();
    for (const person of SEED_ENTITIES) {
      updateEntity(person.id, { country: c.code });
    }
    rebuildSettlement();
    assertCorridorsLegal(`all→${c.code}`);
    for (const o of getStore().netObligations) {
      if (o.chosenRail === "claim_link") continue;
      assert.equal(o.chosenRail, "local", `${c.code} ${o.from}→${o.to}`);
    }
    clearStore();
  }
});

test("a leftover domestic rail from any country remaps onto any other country", () => {
  for (const from of COUNTRIES) {
    for (const leftover of railsFor(from.code)) {
      for (const to of COUNTRIES) {
        const next = alignRailsToCountry(
          to.code,
          [{ railType: leftover, alias: "x" }],
          true,
        );
        assert.ok(
          canonicalizeRail(to.code, next[0]?.railType),
          `${from.code} ${leftover} → ${to.code} kept ${next[0]?.railType}`,
        );
      }
    }
  }
});

test("switching a traveler through every rail of their country keeps corridors legal", () => {
  seedStore();
  runNetting();
  runRouting();
  const alice = getStore().entities.find((e) => e.id === "ent-alice")!;
  for (const rail of railsFor(alice.country)) {
    updateEntity("ent-alice", {
      linkedRailAliases: [{ railType: rail, alias: "alice" }],
    });
    runRouting();
    assert.equal(
      getStore().entities.find((e) => e.id === "ent-alice")
        ?.linkedRailAliases[0]?.railType,
      rail,
    );
    assertCorridorsLegal(`alice ${rail}`);
  }
});

test("unlinking a creditor forces claim links; unlinking a debtor does not invent a foreign rail", () => {
  seedStore();
  runNetting();
  runRouting();
  updateEntity("ent-frank", { linkedRailAliases: [] });
  rerouteUnsettled({ to: "ent-frank" });
  for (const o of getStore().netObligations.filter(
    (o) => o.to === "ent-frank",
  )) {
    assert.equal(o.chosenRail, "claim_link", o.id);
  }
  assertCorridorsLegal("unlink frank");
  updateEntity("ent-bob", { linkedRailAliases: [] });
  rerouteUnsettled();
  assertCorridorsLegal("unlink bob");
});

test("settle and claim every sample transfer, then delete people and expenses", () => {
  seedStore();
  runNetting();
  runRouting();
  const pending = [...getStore().netObligations];
  for (const ob of pending) {
    const res = settleObligation(ob.id);
    assert.equal(res.success, true, ob.id);
    if (ob.chosenRail === "claim_link") {
      const opt = payoutOptionsFor(
        getStore().entities.find((e) => e.id === ob.to)!.country,
      )[0];
      const claimed = claimWithPayoutMethod(res.link!.token, opt);
      assert.equal(claimed.success, true, claimed.message);
    }
  }
  assert.ok(getStore().netObligations.every((o) => o.status === "settled"));
  const expenseId = getStore().expenses[0].id;
  assert.equal(deleteExpense(expenseId), true);
  assert.equal(getStore().netObligations.length, 0);
  seedStore();
  runNetting();
  runRouting();
  assert.equal(deleteEntity("ent-frank"), true);
  assert.equal(getStore().netObligations.length, 0);
});
