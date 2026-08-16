import assert from "node:assert/strict";
import type { Entity, Expense } from "./types.js";
import {
  LINKED_CORRIDORS,
  canonicalizeRail,
  linkedKey,
  sharedLocalRail,
} from "./data/countries.js";
import { addEntity, addExpense, clearStore, getStore } from "./store.js";

export function traveler(
  id: string,
  name: string,
  country: string,
  rail?: string,
): Entity {
  return {
    id,
    name,
    country,
    contact: { type: "email", value: `${id}@x.test` },
    linkedRailAliases: rail ? [{ railType: rail, alias: id }] : [],
  };
}

export function expense(partial: {
  id: string;
  payerId: string;
  participantIds: string[];
  amount: number;
  currency?: string;
  split?: Expense["split"];
}): Expense {
  return {
    tripId: "trip-test",
    category: "general",
    description: partial.id,
    currency: "USD",
    ...partial,
  };
}

export function loadTrip(entities: Entity[], expenses: Expense[] = []): void {
  clearStore();
  for (const e of entities) addEntity(e);
  for (const x of expenses) addExpense(x);
}

/** Every linked rail and every chosen corridor must be possible for those two countries. */
export function assertCorridorsLegal(label = ""): void {
  const prefix = label ? `${label}: ` : "";
  const st = getStore();
  for (const e of st.entities) {
    for (const a of e.linkedRailAliases) {
      assert.ok(
        canonicalizeRail(e.country, a.railType),
        `${prefix}${e.name} in ${e.country} still linked to ${a.railType}`,
      );
    }
  }
  for (const o of st.netObligations) {
    const from = st.entities.find((e) => e.id === o.from);
    const to = st.entities.find((e) => e.id === o.to);
    assert.ok(from && to, `${prefix}${o.id}`);
    if (o.chosenRail === "local") {
      const expected = sharedLocalRail(from.country, to.country);
      assert.ok(expected, `${prefix}local ${from.country}→${to.country}`);
    }
    if (o.chosenRail === "linked") {
      assert.ok(
        LINKED_CORRIDORS[linkedKey(from.country, to.country)],
        `${prefix}linked ${from.country}→${to.country}`,
      );
    }
    const chosen = o.considered?.find((c) => c.chosen);
    if (!chosen) continue;
    if (chosen.type === "local") {
      assert.equal(
        chosen.railName,
        sharedLocalRail(from.country, to.country),
        `${prefix}${from.country}→${to.country} local ${chosen.railName}`,
      );
    }
    if (chosen.type === "linked") {
      assert.equal(
        chosen.railName,
        LINKED_CORRIDORS[linkedKey(from.country, to.country)],
        `${prefix}${from.country}→${to.country} linked ${chosen.railName}`,
      );
    }
    if (chosen.type === "stable_bridge") {
      assert.match(
        chosen.railName,
        /USDC/i,
        `${prefix}${from.country}→${to.country}`,
      );
    }
  }
}

export function assertScenarioCorridors(
  body: {
    entities: Entity[];
    netObligations: {
      id: string;
      from: string;
      to: string;
      chosenRail?: string;
      considered?: { type: string; railName: string; chosen: boolean }[];
    }[];
  },
  label = "",
): void {
  const prefix = label ? `${label}: ` : "";
  for (const e of body.entities) {
    for (const a of e.linkedRailAliases) {
      assert.ok(
        canonicalizeRail(e.country, a.railType),
        `${prefix}${e.name} in ${e.country} still linked to ${a.railType}`,
      );
    }
  }
  for (const o of body.netObligations) {
    const from = body.entities.find((e) => e.id === o.from);
    const to = body.entities.find((e) => e.id === o.to);
    assert.ok(from && to, `${prefix}${o.id}`);
    if (o.chosenRail === "local") {
      assert.ok(
        sharedLocalRail(from.country, to.country),
        `${prefix}local ${from.country}→${to.country}`,
      );
    }
    if (o.chosenRail === "linked") {
      assert.ok(
        LINKED_CORRIDORS[linkedKey(from.country, to.country)],
        `${prefix}linked ${from.country}→${to.country}`,
      );
    }
    const chosen = o.considered?.find((c) => c.chosen);
    if (!chosen) continue;
    if (chosen.type === "local") {
      assert.equal(
        chosen.railName,
        sharedLocalRail(from.country, to.country),
        `${prefix}${from.country}→${to.country}`,
      );
    }
    if (chosen.type === "linked") {
      assert.equal(
        chosen.railName,
        LINKED_CORRIDORS[linkedKey(from.country, to.country)],
        `${prefix}${from.country}→${to.country}`,
      );
    }
    if (chosen.type === "stable_bridge") {
      assert.match(
        chosen.railName,
        /USDC/i,
        `${prefix}${from.country}→${to.country}`,
      );
    }
  }
}
