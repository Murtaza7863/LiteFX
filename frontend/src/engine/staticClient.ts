import type {
  ClaimDetails,
  ComplianceFlag,
  Entity,
  Expense,
  NettingResult,
  ReconciliationResult,
  RoutingResult,
  ScenarioResponse,
  User,
} from "../api/client";

import { FX_TABLE } from "../../../backend/src/types";
import { countryByCode } from "../../../backend/src/data/countries";
import { getFxSnapshot, refreshFx } from "../../../backend/src/fx";
import { runNetting } from "../../../backend/src/agents/netting";
import {
  getRailTypesExercised,
  runRouting,
} from "../../../backend/src/agents/railRouter";
import { runCompliance } from "../../../backend/src/agents/compliance";
import { runReconciliation } from "../../../backend/src/agents/reconciliation";
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
  getClaimLink,
  getStore,
  initStore,
  runAsUser,
  seedStore,
  toPublicUser,
  updateClaimLink,
  updateEntity,
  updateExpense,
  type UserRecord,
} from "../../../backend/src/store";

const SESSION_KEY = "litefx-web-user";
const USERS_KEY = "litefx-web-pass";

const EXPENSE_CATEGORIES = [
  "food",
  "accommodation",
  "transport",
  "activities",
  "general",
] as const;

let booted = false;

async function boot(): Promise<void> {
  if (booted) return;
  booted = true;
  initStore();
  await refreshFx();
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

function passwords(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "{}") as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}

function savePassword(email: string, password: string): void {
  const map = passwords();
  map[email.toLowerCase()] = password;
  localStorage.setItem(USERS_KEY, JSON.stringify(map));
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
  if (!(Number(amount) > 0) || !currency || FX_TABLE[currency] == null) {
    throw new Error("A positive amount and supported currency are required.");
  }
  if (Array.isArray(body.participantIds) && body.participantIds.length === 0) {
    throw new Error("Select at least one participant.");
  }
  const known = new Set(store.entities.map((e) => e.id));
  let participants =
    Array.isArray(body.participantIds) && body.participantIds.length
      ? body.participantIds.filter((id) => known.has(id))
      : (existing?.participantIds ?? store.entities.map((e) => e.id));
  if (!participants.includes(payerId))
    participants = [...participants, payerId];
  participants = [...new Set(participants)];
  if (participants.length === 0) {
    throw new Error("Select at least one participant.");
  }
  const split = body.split ?? existing?.split;
  if (split?.mode === "percent") {
    const assigned = Object.values(split.parts ?? {}).reduce(
      (s, v) => s + Number(v || 0),
      0,
    );
    if (assigned > 100.01) {
      throw new Error("Percent shares cannot exceed 100%.");
    }
  }
  if (split?.mode === "amount") {
    const assigned = Object.values(split.parts ?? {}).reduce(
      (s, v) => s + Number(v || 0),
      0,
    );
    if (assigned > Number(amount) + 0.01) {
      throw new Error("Assigned amounts cannot exceed the expense total.");
    }
  }
  const categoryRaw = (body.category ?? existing?.category ?? "general")
    .toLowerCase()
    .trim();
  const category = EXPENSE_CATEGORIES.includes(
    categoryRaw as (typeof EXPENSE_CATEGORIES)[number],
  )
    ? categoryRaw
    : "general";
  return {
    payerId,
    participantIds: participants,
    amount: Number(amount),
    currency,
    category,
    description:
      (body.description ?? existing?.description ?? "").trim() ||
      "Custom expense",
    split:
      split?.mode && split.mode !== "equal"
        ? { mode: split.mode, parts: split.parts ?? {} }
        : undefined,
  };
}

export const staticClient = {
  getScenario: async () => {
    await boot();
    return asUser(scenario);
  },
  runNetting: async () => {
    await boot();
    return asUser(() => runNetting() as NettingResult);
  },
  runEngine: async () => {
    await boot();
    return asUser(() => {
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
  runCompliance: async () => {
    await boot();
    return asUser(() => ({ flags: runCompliance() as ComplianceFlag[] }));
  },
  runReconciliation: async () => {
    await boot();
    return asUser(() => {
      const results = runReconciliation() as ReconciliationResult[];
      return { results, vendorSummary: getStore().vendorSummary };
    });
  },
  settle: async (id: string) => {
    await boot();
    return asUser(() => settleObligation(id));
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
      if (!body.name || !body.country) {
        throw new Error("name and country are required.");
      }
      if (!countryByCode(body.country)) {
        throw new Error("Unsupported country.");
      }
      const entity: Entity = {
        id: `ent-u${Math.random().toString(36).slice(2, 7)}`,
        name: body.name,
        country: body.country,
        contact: body.contact ?? { type: "email" as const, value: "" },
        linkedRailAliases: body.railType
          ? [{ railType: body.railType, alias: body.alias || "" }]
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
        if (!trimmed) throw new Error("name is required.");
        patch.name = trimmed;
      }
      if (body.country !== undefined) patch.country = body.country;
      if (body.contact !== undefined) {
        patch.contact = {
          type: body.contact.type === "phone" ? "phone" : "email",
          value: body.contact.value ?? "",
        };
      }
      if (body.railType !== undefined) {
        patch.linkedRailAliases = body.railType
          ? [
              {
                railType: body.railType,
                alias: body.alias || existing.linkedRailAliases[0]?.alias || "",
              },
            ]
          : [];
      }
      const entity = updateEntity(id, patch);
      if (!entity) throw new Error("Traveler not found.");
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
    return sessionUser();
  },
  signup: async (body: { name: string; email: string; password: string }) => {
    await boot();
    const name = body.name.trim();
    const email = body.email.trim().toLowerCase();
    if (name.length < 2) throw new Error("Name is required.");
    if (!email.includes("@")) throw new Error("Enter a valid email.");
    if ((body.password ?? "").length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
    if (findUserByEmail(email)) {
      throw new Error("An account with this email already exists.");
    }
    const record: UserRecord = {
      id: newId("usr"),
      email,
      name,
      passwordHash: "web",
      createdAt: new Date().toISOString(),
    };
    addUser(record);
    savePassword(email, body.password);
    const user = toPublicUser(record);
    setSession(user);
    return user;
  },
  login: async (body: { email: string; password: string }) => {
    await boot();
    const email = body.email.trim().toLowerCase();
    const record = findUserByEmail(email);
    if (!record || passwords()[email] !== body.password) {
      throw new Error("Invalid email or password.");
    }
    const user = toPublicUser(record);
    setSession(user);
    return user;
  },
  demo: async () => {
    await boot();
    const record: UserRecord = {
      id: newId("usr"),
      email: `${newId("demo")}@litefx.local`,
      name: "Demo traveler",
      passwordHash: "web",
      createdAt: new Date().toISOString(),
    };
    addUser(record);
    const user = toPublicUser(record);
    setSession(user);
    return user;
  },
  logout: async () => {
    setSession(null);
    return { success: true };
  },
};
