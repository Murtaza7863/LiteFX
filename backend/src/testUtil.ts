import type { Entity, Expense } from "./types.js";
import { addEntity, addExpense, clearStore } from "./store.js";

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
