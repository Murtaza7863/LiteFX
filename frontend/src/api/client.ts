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
  split?: { mode: "equal" | "percent" | "amount"; parts?: Record<string, number> };
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

export interface ScenarioResponse {
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
}

export interface NettingResult {
  obligations: NetObligation[];
  rawEdgeCount: number;
  netEdgeCount: number;
  reductionRatio: number;
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

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path}: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export const client = {
  getScenario: () => api<ScenarioResponse>("/scenario"),
  runNetting: () => api<NettingResult>("/netting/run", "POST"),
  runRouting: () => api<RoutingResult>("/routing/run", "POST"),
  runCompliance: () => api<{ flags: ComplianceFlag[] }>("/compliance/run", "POST"),
  runReconciliation: () =>
    api<{ results: ReconciliationResult[]; vendorSummary: any[] }>(
      "/reconciliation/run",
      "POST"
    ),
  settle: (id: string) =>
    api<{ success: boolean; message: string; link?: ClaimLink }>(
      `/settlement/${id}/settle`,
      "POST"
    ),
  createClaim: (obligationId: string) =>
    api<{ success: boolean; link?: ClaimLink }>(
      `/claim/${obligationId}/create`,
      "POST"
    ),
  getClaim: (token: string) => api<ClaimDetails>(`/claim/${token}`),
  claimWithPayout: (token: string, payoutMethod: string) =>
    api<{ success: boolean; link?: ClaimLink; message: string }>(
      `/claim/${token}/claim`,
      "POST",
      { payoutMethod }
    ),
  reset: () => api<{ success: boolean; message: string }>("/reset", "POST"),
  clear: () => api<{ success: boolean; message: string }>("/clear", "POST"),
  seed: () => api<{ success: boolean; message: string }>("/seed", "POST"),
  addEntity: (body: {
    name: string;
    country: string;
    railType?: string;
    alias?: string;
  }) => api<{ success: boolean; entity: Entity }>("/entities", "POST", body),
  addExpense: (body: {
    payerId: string;
    participantIds: string[];
    amount: number;
    currency: string;
    description: string;
    split?: { mode: "equal" | "percent" | "amount"; parts?: Record<string, number> };
  }) => api<{ success: boolean; expense: Expense }>("/expenses", "POST", body),
  deleteExpense: (id: string) => api<{ success: boolean }>(`/expenses/${id}`, "DELETE"),
  deleteEntity: (id: string) => api<{ success: boolean }>(`/entities/${id}`, "DELETE"),
};
