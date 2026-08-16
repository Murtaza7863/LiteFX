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
  payoutOptionsFor,
  settleObligation,
} from "../../../backend/src/agents/claimLink";
import {
  addEntity,
  addExpense,
  addUser,
  clearStore,
  deleteEntity,
  deleteExpense,
  findClaimOwner,
  findUserByEmail,
  findUserById,
  getClaimLink,
  getStore,
  initStore,
  refreshDerivedForFx,
  runAsUser,
  seedStore,
  toPublicUser,
  updateClaimLink,
  updateEntity,
  updateExpense,
  validateExpenseSplit,
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
    const owner = findClaimOwner(token);
    const link = getClaimLink(token);
    if (!link || !owner) throw new Error("Claim link not found.");
    return runAsUser(owner, () => {
      if (link.status === "pending" && new Date(link.expiresAt) < new Date()) {
        updateClaimLink(link.token, { status: "expired" });
        link.status = "expired";
      }
      const store = getStore();
      const recipient = store.entities.find((e) => e.id === link.recipientId);
      const obligation = store.netObligations.find(
        (o) => o.id === link.obligationId,
      );
      if (!recipient || !obligation) {
        throw new Error("Claim link is no longer valid.");
      }
      return {
        link,
        recipient,
        obligation,
        payoutOptions: payoutOptionsFor(recipient.country),
      } as ClaimDetails;
    });
  },
  claimWithPayout: async (token: string, payoutMethod: string) => {
    await boot();
    const owner = findClaimOwner(token);
    return owner
      ? runAsUser(owner, () => claimWithPayoutMethod(token, payoutMethod))
      : claimWithPayoutMethod(token, payoutMethod);
  },
  clear: async () => {
    await boot();
    asUser(() => clearStore());
    return {
      success: true,
      message: "Cleared. Add your own travelers and expenses.",
    };
  },
  seed: async () => {
    await boot();
    asUser(() => seedStore());
    return { success: true, message: "Sample trip loaded." };
  },
  addEntity: async (body: {
    name: string;
    country: string;
    railType?: string;
    alias?: string;
    contact?: { type: "email" | "phone"; value: string };
  }) => {
    await boot();
    return asUser(() => {
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
      const entity: Entity = {
        id: `ent-u${Math.random().toString(36).slice(2, 7)}`,
        name,
        country: body.country,
        contact: validContact(body.contact),
        linkedRailAliases: rail
          ? [{ railType: rail, alias: body.alias || "" }]
          : [],
      };
      addEntity(entity as Parameters<typeof addEntity>[0]);
      return { success: true, entity };
    });
  },
  addExpense: async (body: ExpenseBody) => {
    await boot();
    return asUser(() => {
      const parsed = parseExpenseFields(body);
      const expense: Expense = {
        id: `exp-u${Math.random().toString(36).slice(2, 7)}`,
        tripId: "trip-custom",
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
      if (body.contact !== undefined) {
        patch.contact = validContact(body.contact);
      }
      if (body.railType !== undefined) {
        const rail = canonicalizeRail(
          body.country ?? existing.country,
          body.railType,
        );
        if (body.railType?.trim() && !rail) {
          throw new Error("Unsupported settlement rail.");
        }
        patch.linkedRailAliases = rail
          ? [
              {
                railType: rail,
                alias: body.alias || existing.linkedRailAliases[0]?.alias || "",
              },
            ]
          : [];
      } else if (body.country !== undefined && existing.linkedRailAliases[0]) {
        const rail = canonicalizeRail(
          body.country,
          existing.linkedRailAliases[0].railType,
        );
        patch.linkedRailAliases = rail
          ? [
              {
                railType: rail,
                alias: existing.linkedRailAliases[0].alias,
              },
            ]
          : [];
      }
      const entity = updateEntity(id, patch);
      if (!entity) throw new Error("Traveler not found.");
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
