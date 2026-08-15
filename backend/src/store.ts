import type {
  Entity,
  Expense,
  DebtEdge,
  NetObligation,
  ClaimLink,
  ComplianceFlag,
  Invoice,
  ReconciliationResult,
} from "./types";
import { toUsd } from "./types";
import { SEED_ENTITIES, SEED_EXPENSES, SEED_INVOICES } from "./data/seed";

// ──────────────────────────────────────────────
// In-memory store. No database at hackathon scale.
// In production this would be SQLite / Postgres.
// ──────────────────────────────────────────────

export interface StoreState {
  entities: Entity[];
  expenses: Expense[];
  debtEdges: DebtEdge[];
  netObligations: NetObligation[];
  claimLinks: ClaimLink[];
  complianceFlags: ComplianceFlag[];
  invoices: Invoice[];
  reconciliationResults: ReconciliationResult[];
}

function deriveDebtEdges(expenses: Expense[]): DebtEdge[] {
  const edges: DebtEdge[] = [];
  let counter = 0;
  for (const exp of expenses) {
    const share = exp.amount / exp.participantIds.length;
    for (const pid of exp.participantIds) {
      if (pid === exp.payerId) continue; // payer doesn't owe themselves
      const currency = exp.currency;
      edges.push({
        id: `debt-${++counter}`,
        from: pid,
        to: exp.payerId,
        amount: Math.round(share * 100) / 100,
        currency,
        amountUsd: toUsd(share, currency),
        sourceExpenseId: exp.id,
      });
    }
  }
  return edges;
}

function freshState(): StoreState {
  return {
    entities: structuredClone(SEED_ENTITIES),
    expenses: structuredClone(SEED_EXPENSES),
    debtEdges: deriveDebtEdges(SEED_EXPENSES),
    netObligations: [],
    claimLinks: [],
    complianceFlags: [],
    invoices: structuredClone(SEED_INVOICES),
    reconciliationResults: [],
  };
}

let state: StoreState = freshState();

export function getStore(): StoreState {
  return state;
}

export function resetStore(): void {
  state = freshState();
}

// Convenience getters
export function getEntity(id: string): Entity | undefined {
  return state.entities.find((e) => e.id === id);
}

export function getNetObligation(id: string): NetObligation | undefined {
  return state.netObligations.find((o) => o.id === id);
}

export function updateNetObligation(id: string, patch: Partial<NetObligation>): void {
  const ob = state.netObligations.find((o) => o.id === id);
  if (ob) Object.assign(ob, patch);
}

export function getClaimLink(token: string): ClaimLink | undefined {
  return state.claimLinks.find((c) => c.token === token);
}

export function updateClaimLink(token: string, patch: Partial<ClaimLink>): void {
  const cl = state.claimLinks.find((c) => c.token === token);
  if (cl) Object.assign(cl, patch);
}

export function addClaimLink(link: ClaimLink): void {
  state.claimLinks.push(link);
}

export function setComplianceFlags(flags: ComplianceFlag[]): void {
  state.complianceFlags = flags;
}

export function setReconciliationResults(results: ReconciliationResult[]): void {
  state.reconciliationResults = results;
}

export function setNetObligations(obs: NetObligation[]): void {
  state.netObligations = obs;
}
