// ──────────────────────────────────────────────
// API client — thin wrapper around fetch.
// All endpoints are proxied to localhost:3001 via Vite.
// ──────────────────────────────────────────────

export interface Entity {
  id: string;
  name: string;
  country: string;
  contact: { type: string; value: string };
  linkedRailAliases: { railType: string; alias: string }[];
  contactId?: string;
}

export interface SavedContact {
  id: string;
  name: string;
  country: string;
  contact: { type: string; value: string };
  linkedRailAliases: { railType: string; alias: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  payerId: string;
  participantIds: string[];
  amount: number;
  currency: string;
  tripId: string;
  category: string;
  description: string;
  split?: {
    mode: "equal" | "percent" | "amount";
    parts?: Record<string, number>;
  };
}

export interface DebtEdge {
  id: string;
  from: string;
  to: string;
  amount: number;
  currency: string;
  amountUsd: number;
  sourceExpenseId: string;
}

export type RailType = "local" | "linked" | "claim_link" | "stable_bridge";

export interface RailConsideration {
  type: RailType;
  railName: string;
  feeEstimatePct: number;
  timeEstimateHours: number;
  chosen: boolean;
  eligible?: boolean;
  note: string;
}

export interface NetObligation {
  id: string;
  from: string;
  to: string;
  amount: number;
  settlementCurrency: string;
  amountUsd: number;
  status: "pending" | "routed" | "settled";
  chosenRail?: RailType;
  routingReason?: string;
  claimToken?: string;
  complianceFlags?: ComplianceFlag[];
  considered?: RailConsideration[];
  feeUsd?: number;
  timeHours?: number;
  matchReason?: string;
}

export interface ComplianceFlag {
  obligationId: string;
  type: "limit_exceeded" | "frequency_anomaly";
  message: string;
  severity: "warning" | "info";
}

export interface ClaimLink {
  token: string;
  obligationId: string;
  recipientId: string;
  recipientContact: string;
  status: "pending" | "claimed" | "expired";
  createdAt: string;
  expiresAt: string;
  payoutMethod?: string;
}

export interface Invoice {
  id: string;
  vendorId: string;
  vendorName: string;
  amount: number;
  currency: string;
  bookingRef: string;
  status: "open" | "reconciled" | "mismatch";
}

export interface ReconciliationResult {
  invoice: Invoice;
  matchedObligationId?: string;
  matchedAmountUsd?: number;
  invoiceAmountUsd: number;
  status: "reconciled" | "mismatch" | "unmatched";
  note: string;
}

export interface LedgerEntry {
  id: string;
  obligationId: string;
  from: string;
  to: string;
  rail: string;
  amount: number;
  currency: string;
  amountUsd: number;
  status: "settled" | "claimed";
  timestamp: string;
}

export interface FxSnapshot {
  live: boolean;
  asOf: string | null;
  rates: Record<string, number>;
}

export interface SettlementInsight {
  type: "link_account";
  recipientId: string;
  recipientName: string;
  country: string;
  suggestedRail: string;
  currentFeeUsd: number;
  linkedFeeUsd: number;
  savingsUsd: number;
  wouldBeRail: string;
  wouldBeRailName: string;
  message: string;
}

export interface SettlementPlan {
  text: string;
  insights: SettlementInsight[];
}

export interface TripSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  active: boolean;
  travelerCount: number;
  expenseCount: number;
  settledCount: number;
  ledgerCount: number;
  netted: boolean;
}

export interface ScenarioResponse {
  trip?: TripSummary;
  trips?: TripSummary[];
  contacts?: SavedContact[];
  entities: Entity[];
  expenses: Expense[];
  debtEdges: DebtEdge[];
  invoices: Invoice[];
  netObligations: NetObligation[];
  claimLinks: ClaimLink[];
  complianceFlags: ComplianceFlag[];
  reconciliationResults: ReconciliationResult[];
  ledger: LedgerEntry[];
  nettingSummary: NettingResult | null;
  complianceRan: boolean;
  reconciliationRan: boolean;
  vendorSummary: any[];
  fx?: FxSnapshot;
  plan?: SettlementPlan;
}

export interface NettingResult {
  obligations?: NetObligation[];
  rawEdgeCount: number;
  netEdgeCount: number;
  reductionRatio: number;
  transfersSaved: number;
  rawTotalUsd: number;
  netTotalUsd: number;
  feeSavingsUsd: number;
  greedyFeeUsd?: number;
  corridorSavingsUsd?: number;
  balances: { entityId: string; entityName: string; netUsd: number }[];
}
export interface RoutingResult {
  obligations: NetObligation[];
  railTypesExercised: RailType[];
}

export interface ClaimDetails {
  link: ClaimLink;
  recipient: Entity;
  obligation: NetObligation;
  payoutOptions: string[];
}

export interface User {
  id: string;
  email: string;
  name: string;
}

import { staticClient } from "../engine/staticClient";

async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  opts?: { skipAuthEvent?: boolean },
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: body
      ? { "Content-Type": "application/json", "X-LiteFX-Request": "1" }
      : method !== "GET"
        ? { "X-LiteFX-Request": "1" }
        : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !opts?.skipAuthEvent) {
    window.dispatchEvent(new Event("litefx:unauthorized"));
  }
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      /* keep raw */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const httpClient = {
  getScenario: () => api<ScenarioResponse>("/scenario"),
  runNetting: () => api<NettingResult>("/netting/run", "POST"),
  runEngine: () => api<NettingResult & RoutingResult>("/engine/run", "POST"),
  runRouting: () => api<RoutingResult>("/routing/run", "POST"),
  settle: (id: string) =>
    api<{ success: boolean; message: string; link?: ClaimLink }>(
      `/settlement/${id}/settle`,
      "POST",
    ),
  overrideRail: (id: string, railName: string) =>
    api<{ success: boolean; obligation: NetObligation }>(
      `/obligations/${id}/rail`,
      "POST",
      { railName },
    ),
  linkAccount: (id: string) =>
    api<{ success: boolean; entity: Entity }>(
      `/entities/${id}/link-account`,
      "POST",
      {},
    ),
  getClaim: (token: string) => api<ClaimDetails>(`/claim/${token}`),
  claimWithPayout: (token: string, payoutMethod: string) =>
    api<{ success: boolean; link?: ClaimLink; message: string }>(
      `/claim/${token}/claim`,
      "POST",
      { payoutMethod },
    ),
  clear: () => api<{ success: boolean; message: string }>("/clear", "POST"),
  seed: (opts?: { asNew?: boolean }) =>
    api<{ success: boolean; message: string }>("/seed", "POST", opts),
  addEntity: (body: {
    name?: string;
    country?: string;
    railType?: string;
    alias?: string;
    contact?: { type: "email" | "phone"; value: string };
    contactId?: string;
  }) => api<{ success: boolean; entity: Entity }>("/entities", "POST", body),
  addExpense: (body: {
    payerId: string;
    participantIds: string[];
    amount: number;
    currency: string;
    description: string;
    category?: string;
    split?: {
      mode: "equal" | "percent" | "amount";
      parts?: Record<string, number>;
    };
  }) => api<{ success: boolean; expense: Expense }>("/expenses", "POST", body),
  updateEntity: (
    id: string,
    body: {
      name?: string;
      country?: string;
      railType?: string | null;
      alias?: string;
      contact?: { type: "email" | "phone"; value: string };
    },
  ) =>
    api<{ success: boolean; entity: Entity }>(`/entities/${id}`, "PATCH", body),
  updateExpense: (
    id: string,
    body: {
      payerId?: string;
      participantIds?: string[];
      amount?: number;
      currency?: string;
      description?: string;
      category?: string;
      split?: {
        mode: "equal" | "percent" | "amount";
        parts?: Record<string, number>;
      };
    },
  ) =>
    api<{ success: boolean; expense: Expense }>(
      `/expenses/${id}`,
      "PATCH",
      body,
    ),
  deleteExpense: (id: string) =>
    api<{ success: boolean }>(`/expenses/${id}`, "DELETE"),
  deleteEntity: (id: string) =>
    api<{ success: boolean }>(`/entities/${id}`, "DELETE"),
  createTrip: (name?: string) =>
    api<{ success: boolean; trip: TripSummary; trips: TripSummary[] }>(
      "/trips",
      "POST",
      { name },
    ),
  selectTrip: (id: string) =>
    api<{ success: boolean; trip: TripSummary; trips: TripSummary[] }>(
      `/trips/${id}/select`,
      "POST",
    ),
  renameTrip: (id: string, name: string) =>
    api<{ success: boolean; trip: TripSummary; trips: TripSummary[] }>(
      `/trips/${id}`,
      "PATCH",
      { name },
    ),
  deleteTrip: (id: string) =>
    api<{ success: boolean; trip: TripSummary; trips: TripSummary[] }>(
      `/trips/${id}`,
      "DELETE",
    ),
  duplicateTrip: (id: string) =>
    api<{ success: boolean; trip: TripSummary; trips: TripSummary[] }>(
      `/trips/${id}/duplicate`,
      "POST",
    ),
  deleteContact: (id: string) =>
    api<{ success: boolean; contacts: SavedContact[] }>(
      `/contacts/${id}`,
      "DELETE",
    ),
  saveCrew: () =>
    api<{ success: boolean; contacts: SavedContact[]; entities: Entity[] }>(
      "/contacts/save-crew",
      "POST",
    ),
  me: async (): Promise<User | null> => {
    try {
      const r = await api<{ user: User }>("/auth/me", "GET", undefined, {
        skipAuthEvent: true,
      });
      return r.user;
    } catch {
      return null;
    }
  },
  signup: async (body: { name: string; email: string; password: string }) => {
    const r = await api<{ user: User }>("/auth/signup", "POST", body, {
      skipAuthEvent: true,
    });
    return r.user;
  },
  login: async (body: { email: string; password: string }) => {
    const r = await api<{ user: User }>("/auth/login", "POST", body, {
      skipAuthEvent: true,
    });
    return r.user;
  },
  demo: async () => {
    const r = await api<{ user: User }>(
      "/auth/demo",
      "POST",
      {},
      {
        skipAuthEvent: true,
      },
    );
    return r.user;
  },
  logout: () => api<{ success: boolean }>("/auth/logout", "POST"),
};

export const isStaticEngine =
  import.meta.env.VITE_STATIC === "1" || import.meta.env.BASE_URL !== "/";

export const client = isStaticEngine ? staticClient : httpClient;
