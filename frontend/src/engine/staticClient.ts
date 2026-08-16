import type {
  ClaimDetails,
  Entity,
  Expense,
  NettingResult,
  RoutingResult,
  ScenarioResponse,
  User,
} from "../api/client";

import { FX_TABLE } from "../../../backend/src/types";
import {
  canonicalizeRail,
  countryByCode,
  linkedAliasesFromUpdate,
} from "../../../backend/src/data/countries";
import {
  classifyExpense,
  isExpenseCategory,
} from "../../../backend/src/data/classifyExpense";
import { getFxSnapshot, refreshFx } from "../../../backend/src/fx";
import { runNetting } from "../../../backend/src/agents/netting";
import {
  getRailTypesExercised,
  linkRecipientAccount,
  overrideRail,
  rerouteUnsettled,
  runRouting,
} from "../../../backend/src/agents/railRouter";
import { buildSettlementPlan } from "../../../backend/src/agents/plan";
import {
  claimWithPayoutMethod,
  getClaimDetails,
  settleObligation,
} from "../../../backend/src/agents/claimLink";
import {
  addEntityFromContact,
  addExpense,
  addUser,
  clearStore,
  createTraveler,
  createTrip,
  currentTripSummary,
  deleteContact,
  deleteEntity,
  deleteExpense,
  deleteTrip,
  duplicateTrip,
  findUserByEmail,
  findUserById,
  getStore,
  initStore,
  listContacts,
  listTripSummaries,
  loadSampleTrip,
  refreshDerivedForFx,
  renameTrip,
  rememberTraveler,
  runAsUser,
  saveTripCrew,
  seedStore,
  selectTrip,
  toPublicUser,
  travelerOnTrip,
  updateEntity,
  updateExpense,
  validateExpenseSplit,
  withClaimTrip,
  type UserRecord,
} from "../../../backend/src/store";

const SESSION_KEY = "litefx-web-user";

let booted = false;

async function boot(): Promise<void> {
  if (booted) return;
  booted = true;
  try {
    localStorage.removeItem("litefx-web-pass");
    initStore();
  } catch {
    /* private mode / blocked storage */
  }
  // Never block first paint on a live FX fetch — static table is enough.
  void refreshFx().then((updated) => {
    if (updated) refreshDerivedForFx();
  });
}

function sessionUser(): User | null {
  try {
    return JSON.parse(
      localStorage.getItem(SESSION_KEY) || "null",
    ) as User | null;
  } catch {
    return null;
  }
}

function setSession(user: User | null): void {
  if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  else localStorage.removeItem(SESSION_KEY);
}

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function requireUser(): User {
  const user = sessionUser();
  if (!user) {
    window.dispatchEvent(new Event("litefx:unauthorized"));
    throw new Error("Sign in required.");
  }
  return user;
}

function asUser<T>(fn: () => T): T {
  const user = requireUser();
  return runAsUser(user.id, fn);
}

function tripCurrencies(): string[] {
  return [...new Set(getStore().expenses.map((e) => e.currency))];
}

function scenario(): ScenarioResponse {
  const store = getStore();
  return {
    trip: currentTripSummary(),
    trips: listTripSummaries(),
    contacts: listContacts(),
    entities: store.entities,
    expenses: store.expenses,
    debtEdges: store.debtEdges,
    invoices: store.invoices,
    netObligations: store.netObligations,
    claimLinks: store.claimLinks,
    complianceFlags: store.complianceFlags,
    reconciliationResults: store.reconciliationResults,
    ledger: store.ledger,
    nettingSummary: store.nettingSummary,
    complianceRan: store.complianceRan,
    reconciliationRan: store.reconciliationRan,
    vendorSummary: store.vendorSummary,
    fx: getFxSnapshot(tripCurrencies()),
    plan: buildSettlementPlan(),
  };
}

type ExpenseBody = {
  payerId?: string;
  participantIds?: string[];
  amount?: number;
  currency?: string;
  description?: string;
  category?: string;
  split?: {
    mode?: "equal" | "percent" | "amount";
    parts?: Record<string, number>;
  };
};

function parseExpenseFields(
  body: ExpenseBody,
  existing?: Expense,
): Omit<Expense, "id" | "tripId"> {
  const store = getStore();
  const payerId = body.payerId ?? existing?.payerId;
  if (!payerId || !store.entities.some((e) => e.id === payerId)) {
    throw new Error("A valid payer is required.");
  }
  const amount = body.amount ?? existing?.amount;
  const currency = body.currency ?? existing?.currency;
  const amt = Number(amount);
  if (
    !Number.isFinite(amt) ||
    amt <= 0 ||
    amt > 1_000_000_000_000 ||
    !currency ||
    FX_TABLE[currency] == null
  ) {
    throw new Error("A positive amount and supported currency are required.");
  }
  if (Array.isArray(body.participantIds) && body.participantIds.length === 0) {
    throw new Error("Select at least one participant.");
  }
  const known = new Set(store.entities.map((e) => e.id));
  if (
    Array.isArray(body.participantIds) &&
    body.participantIds.some((id) => !known.has(id))
  ) {
    throw new Error("Every participant must be a traveler on this trip.");
  }
  let participants =
    Array.isArray(body.participantIds) && body.participantIds.length
      ? body.participantIds.filter((id) => known.has(id))
      : (existing?.participantIds ?? store.entities.map((e) => e.id));
  participants = [...new Set(participants)];
  if (participants.length === 0) {
    throw new Error("Select at least one participant.");
  }
  const split = body.split ?? existing?.split;
  const splitError = validateExpenseSplit(split, amt);
  if (splitError) throw new Error(splitError);
  const description = (
    (body.description ?? existing?.description ?? "").trim() || "Custom expense"
  ).slice(0, 200);
  const rawCategory = (body.category ?? "").toLowerCase().trim();
  const category = isExpenseCategory(rawCategory)
    ? rawCategory
    : existing && body.category === undefined && existing.category
      ? existing.category
      : classifyExpense(description).category;
  return {
    payerId,
    participantIds: participants,
    amount: amt,
    currency,
    category,
    description,
    split:
      split?.mode && split.mode !== "equal"
        ? { mode: split.mode, parts: split.parts ?? {} }
        : undefined,
  };
}

function validContact(contact?: { type: "email" | "phone"; value: string }): {
  type: "email" | "phone";
  value: string;
} {
  if (!contact) return { type: "email", value: "" };
  const value = (contact.value ?? "").trim();
  if (value.length > 254) throw new Error("Contact is too long.");
  if (
    value &&
    contact.type === "email" &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  ) {
    throw new Error("Enter a valid contact email.");
  }
  if (value && contact.type === "phone") {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) {
      throw new Error("Enter a valid contact phone number.");
    }
  }
  return { type: contact.type, value };
}

function assertCanNet(): void {
  const store = getStore();
  if (store.debtEdges.length === 0) {
    throw new Error("Add a shared expense before running the engine.");
  }
  if (store.netObligations.length > 0) {
    throw new Error("This trip is already netted.");
  }
}

export const staticClient = {
  getScenario: async () => {
    await boot();
    return asUser(scenario);
  },
  runNetting: async () => {
    await boot();
    return asUser(() => {
      assertCanNet();
      return runNetting() as NettingResult;
    });
  },
  runEngine: async () => {
    await boot();
    return asUser(() => {
      assertCanNet();
      const netting = runNetting();
      const obligations = runRouting();
      return {
        ...netting,
        obligations,
        railTypesExercised: getRailTypesExercised(),
      } as NettingResult & RoutingResult;
    });
  },
  runRouting: async () => {
    await boot();
    return asUser(() => {
      const obligations = runRouting();
      return {
        obligations,
        railTypesExercised: getRailTypesExercised(),
      } as RoutingResult;
    });
  },
  settle: async (id: string) => {
    await boot();
    return asUser(() => settleObligation(id));
  },
  overrideRail: async (id: string, railName: string) => {
    await boot();
    return asUser(() => ({
      success: true as const,
      obligation: overrideRail(id, railName),
    }));
  },
  linkAccount: async (id: string) => {
    await boot();
    return asUser(() => ({
      success: true as const,
      entity: linkRecipientAccount(id),
    }));
  },
  getClaim: async (token: string) => {
    await boot();
    const result = withClaimTrip(token, () => {
      const details = getClaimDetails(token);
      if (!details) throw new Error("Claim link not found.");
      return details as ClaimDetails;
    });
    if (!result) throw new Error("Claim link not found.");
    return result;
  },
  claimWithPayout: async (token: string, payoutMethod: string) => {
    await boot();
    const result = withClaimTrip(token, () =>
      claimWithPayoutMethod(token, payoutMethod),
    );
    if (!result) throw new Error("Claim link not found.");
    return result;
  },
  clear: async () => {
    await boot();
    asUser(() => clearStore());
    return {
      success: true,
      message: "Cleared. Add your own travelers and expenses.",
    };
  },
  seed: async (opts?: { asNew?: boolean }) => {
    await boot();
    asUser(() => {
      if (opts?.asNew) {
        const result = loadSampleTrip();
        if ("error" in result) throw new Error(result.error);
      } else {
        seedStore();
      }
    });
    return { success: true, message: "Sample trip loaded." };
  },
  addEntity: async (body: {
    name?: string;
    country?: string;
    railType?: string;
    alias?: string;
    contact?: { type: "email" | "phone"; value: string };
    contactId?: string;
  }) => {
    await boot();
    return asUser(() => {
      if (body.contactId) {
        const result = addEntityFromContact(body.contactId);
        if ("error" in result) throw new Error(result.error);
        return { success: true, entity: result };
      }
      const name = (body.name ?? "").trim();
      if (!name || !body.country) {
        throw new Error("name and country are required.");
      }
      if (name.length > 80) {
        throw new Error("Name must be 1–80 characters.");
      }
      if (!countryByCode(body.country)) {
        throw new Error("Unsupported country.");
      }
      const rail = canonicalizeRail(body.country, body.railType);
      if (body.railType?.trim() && !rail) {
        throw new Error("Unsupported settlement rail.");
      }
      const result = createTraveler({
        id: `ent-u${Math.random().toString(36).slice(2, 7)}`,
        name,
        country: body.country,
        contact: validContact(body.contact),
        linkedRailAliases: rail
          ? [{ railType: rail, alias: body.alias || "" }]
          : [],
      });
      if ("error" in result) throw new Error(result.error);
      return { success: true, entity: result };
    });
  },
  addExpense: async (body: ExpenseBody) => {
    await boot();
    return asUser(() => {
      const parsed = parseExpenseFields(body);
      const expense: Expense = {
        id: `exp-u${Math.random().toString(36).slice(2, 7)}`,
        tripId: getStore().id,
        ...parsed,
      };
      addExpense(expense);
      return { success: true, expense };
    });
  },
  updateEntity: async (
    id: string,
    body: {
      name?: string;
      country?: string;
      railType?: string | null;
      alias?: string;
      contact?: { type: "email" | "phone"; value: string };
    },
  ) => {
    await boot();
    return asUser(() => {
      const existing = getStore().entities.find((e) => e.id === id);
      if (!existing) throw new Error("Traveler not found.");
      if (body.country !== undefined && !countryByCode(body.country)) {
        throw new Error("Unsupported country.");
      }
      const patch: Parameters<typeof updateEntity>[1] = {};
      if (body.name !== undefined) {
        const trimmed = body.name.trim();
        if (!trimmed || trimmed.length > 80) {
          throw new Error("Name must be 1–80 characters.");
        }
        patch.name = trimmed;
      }
      if (body.country !== undefined) patch.country = body.country;
      const nextName = patch.name ?? existing.name;
      const nextCountry = patch.country ?? existing.country;
      if (travelerOnTrip(nextName, nextCountry, existing.id)) {
        throw new Error(`${nextName.trim()} is already on this trip.`);
      }
      if (body.contact !== undefined) {
        patch.contact = validContact(body.contact);
      }
      const rails = linkedAliasesFromUpdate(existing, {
        country: body.country,
        railType: body.railType,
        alias: body.alias,
      });
      if ("error" in rails) throw new Error(rails.error);
      if (rails.linkedRailAliases) {
        patch.linkedRailAliases = rails.linkedRailAliases;
      }
      const updated = updateEntity(id, patch);
      if (!updated) throw new Error("Traveler not found.");
      const entity = rememberTraveler(updated);
      if (
        patch.linkedRailAliases &&
        getStore().netObligations.some((o) => o.status !== "settled")
      ) {
        rerouteUnsettled({ to: id });
      }
      return { success: true, entity };
    });
  },
  updateExpense: async (id: string, body: ExpenseBody) => {
    await boot();
    return asUser(() => {
      const existing = getStore().expenses.find((e) => e.id === id);
      if (!existing) throw new Error("Expense not found.");
      const parsed = parseExpenseFields(body, existing);
      const expense = updateExpense(id, { ...existing, ...parsed });
      if (!expense) throw new Error("Expense not found.");
      return { success: true, expense };
    });
  },
  deleteExpense: async (id: string) => {
    await boot();
    return asUser(() => ({ success: deleteExpense(id) }));
  },
  deleteEntity: async (id: string) => {
    await boot();
    return asUser(() => ({ success: deleteEntity(id) }));
  },
  createTrip: async (name?: string) => {
    await boot();
    return asUser(() => {
      const result = createTrip(name);
      if ("error" in result) throw new Error(result.error);
      return {
        success: true as const,
        trip: currentTripSummary(),
        trips: listTripSummaries(),
      };
    });
  },
  selectTrip: async (id: string) => {
    await boot();
    return asUser(() => {
      if (!selectTrip(id)) throw new Error("Trip not found.");
      return {
        success: true as const,
        trip: currentTripSummary(),
        trips: listTripSummaries(),
      };
    });
  },
  renameTrip: async (id: string, name: string) => {
    await boot();
    return asUser(() => {
      const result = renameTrip(id, name);
      if ("error" in result) throw new Error(result.error);
      return {
        success: true as const,
        trip: currentTripSummary(),
        trips: listTripSummaries(),
      };
    });
  },
  deleteTrip: async (id: string) => {
    await boot();
    return asUser(() => {
      const result = deleteTrip(id);
      if ("error" in result) throw new Error(result.error);
      return {
        success: true as const,
        trip: currentTripSummary(),
        trips: listTripSummaries(),
      };
    });
  },
  duplicateTrip: async (id: string) => {
    await boot();
    return asUser(() => {
      const result = duplicateTrip(id);
      if ("error" in result) throw new Error(result.error);
      return {
        success: true as const,
        trip: currentTripSummary(),
        trips: listTripSummaries(),
      };
    });
  },
  deleteContact: async (id: string) => {
    await boot();
    return asUser(() => {
      if (!deleteContact(id)) throw new Error("Saved person not found.");
      return { success: true as const, contacts: listContacts() };
    });
  },
  saveCrew: async () => {
    await boot();
    return asUser(() => ({
      success: true as const,
      contacts: saveTripCrew(),
      entities: getStore().entities,
    }));
  },
  me: async (): Promise<User | null> => {
    await boot();
    const user = sessionUser();
    if (!user) return null;
    if (!findUserById(user.id)) {
      setSession(null);
      return null;
    }
    return user;
  },
  signup: async (_body: { name: string; email: string; password: string }) => {
    throw new Error("Accounts are available on the server deployment.");
  },
  login: async (_body: { email: string; password: string }) => {
    throw new Error("Accounts are available on the server deployment.");
  },
  demo: async () => {
    await boot();
    const email = "demo@litefx.local";
    const record =
      findUserByEmail(email) ??
      ({
        id: "usr-demo",
        email,
        name: "Demo traveler",
        passwordHash: "static-demo",
        createdAt: new Date().toISOString(),
      } satisfies UserRecord);
    if (!findUserByEmail(email)) addUser(record);
    const user = toPublicUser(record);
    setSession(user);
    return user;
  },
  logout: async () => {
    setSession(null);
    return { success: true };
  },
};
