import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Entity,
  Expense,
  DebtEdge,
  NetObligation,
  ClaimLink,
  ComplianceFlag,
  Invoice,
  ReconciliationResult,
  SettlementRecord,
  NettingSummary,
  VendorSummaryRow,
} from "./types.js";
import { toUsd } from "./types.js";
import { SEED_ENTITIES, SEED_EXPENSES, SEED_INVOICES } from "./data/seed.js";

// ──────────────────────────────────────────────
// File-backed store. State is persisted to a JSON
// file so the app behaves like a real working app
// (data survives restarts) rather than a demo that
// resets on every reload.
// ──────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

export interface StoreState {
  entities: Entity[];
  expenses: Expense[];
  debtEdges: DebtEdge[];
  netObligations: NetObligation[];
  claimLinks: ClaimLink[];
  complianceFlags: ComplianceFlag[];
  invoices: Invoice[];
  reconciliationResults: ReconciliationResult[];
  ledger: SettlementRecord[];
  nettingSummary: NettingSummary | null;
  complianceRan: boolean;
  reconciliationRan: boolean;
  vendorSummary: VendorSummaryRow[];
}

function deriveDebtEdges(expenses: Expense[]): DebtEdge[] {
  const edges: DebtEdge[] = [];
  let counter = 0;
  for (const exp of expenses) {
    const shares = computeShares(exp);
    for (const pid of exp.participantIds) {
      if (pid === exp.payerId) continue;
      const owed = shares[pid] ?? 0;
      if (owed <= 0) continue;
      const currency = exp.currency;
      edges.push({
        id: `debt-${++counter}`,
        from: pid,
        to: exp.payerId,
        amount: Math.round(owed * 100) / 100,
        currency,
        amountUsd: toUsd(owed, currency),
        sourceExpenseId: exp.id,
      });
    }
  }
  return edges;
}

// The portion of the bill each participant is responsible for.
// Supports equal, percentage, and exact-amount splits (Splitwise baseline).
function computeShares(exp: Expense): Record<string, number> {
  const n = exp.participantIds.length || 1;
  const mode = exp.split?.mode ?? "equal";
  const parts = exp.split?.parts ?? {};
  const shares: Record<string, number> = {};

  if (mode === "percent") {
    let assigned = 0;
    for (const pid of exp.participantIds) {
      const pct = parts[pid] ?? 0;
      shares[pid] = (exp.amount * pct) / 100;
      assigned += pct;
    }
    // Give the payer any unassigned remainder so shares sum to the total.
    const remainderPct = 100 - assigned;
    if (remainderPct > 0) shares[exp.payerId] = (shares[exp.payerId] ?? 0) + (exp.amount * remainderPct) / 100;
  } else if (mode === "amount") {
    let assigned = 0;
    for (const pid of exp.participantIds) {
      const amt = parts[pid] ?? 0;
      shares[pid] = amt;
      assigned += amt;
    }
    const remainder = exp.amount - assigned;
    if (remainder > 0) shares[exp.payerId] = (shares[exp.payerId] ?? 0) + remainder;
  } else {
    for (const pid of exp.participantIds) shares[pid] = exp.amount / n;
  }
  return shares;
}

function freshState(): StoreState {
  return {
    entities: [],
    expenses: [],
    debtEdges: [],
    netObligations: [],
    claimLinks: [],
    complianceFlags: [],
    invoices: [],
    reconciliationResults: [],
    ledger: [],
    nettingSummary: null,
    complianceRan: false,
    reconciliationRan: false,
    vendorSummary: [],
  };
}

// Optional pre-vetted example (loaded via "Load sample"), not the default.
function sampleState(): StoreState {
  return {
    ...freshState(),
    entities: structuredClone(SEED_ENTITIES),
    expenses: structuredClone(SEED_EXPENSES),
    debtEdges: deriveDebtEdges(SEED_EXPENSES),
    invoices: structuredClone(SEED_INVOICES),
  };
}

let state: StoreState | null = null;

function save(): void {
  if (!state) return;
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(DB_PATH, JSON.stringify(state, null, 2));
  } catch (e) {
    console.warn("[store] failed to persist:", (e as Error).message);
  }
}

function load(): StoreState | null {
  try {
    if (!existsSync(DB_PATH)) return null;
    const raw = readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoreState;
    if (!parsed.entities || !parsed.expenses) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function initStore(): void {
  if (state) return;
  state = load() ?? freshState();
  save();
}

export function getStore(): StoreState {
  initStore();
  return state!;
}

export function resetStore(): void {
  state = freshState();
  save();
}

export function seedStore(): void {
  state = sampleState();
  save();
}

// Convenience getters
export function getEntity(id: string): Entity | undefined {
  return getStore().entities.find((e) => e.id === id);
}

export function getNetObligation(id: string): NetObligation | undefined {
  return getStore().netObligations.find((o) => o.id === id);
}

export function updateNetObligation(id: string, patch: Partial<NetObligation>): void {
  const ob = getStore().netObligations.find((o) => o.id === id);
  if (ob) Object.assign(ob, patch);
  save();
}

export function getClaimLink(token: string): ClaimLink | undefined {
  return getStore().claimLinks.find((c) => c.token === token);
}

export function updateClaimLink(token: string, patch: Partial<ClaimLink>): void {
  const cl = getStore().claimLinks.find((c) => c.token === token);
  if (cl) Object.assign(cl, patch);
  save();
}

export function addClaimLink(link: ClaimLink): void {
  getStore().claimLinks.push(link);
  save();
}

export function setComplianceFlags(flags: ComplianceFlag[]): void {
  getStore().complianceFlags = flags;
  save();
}

export function setReconciliationResults(results: ReconciliationResult[]): void {
  getStore().reconciliationResults = results;
  save();
}

export function setNetObligations(obs: NetObligation[]): void {
  getStore().netObligations = obs;
  save();
}

// ── Settlement ledger ─────────────────────────
export function addLedgerEntry(rec: SettlementRecord): void {
  getStore().ledger.push(rec);
  save();
}

// ── Persisted run-summaries (for UI rehydration) ──
export function setNettingSummary(s: NettingSummary | null): void {
  getStore().nettingSummary = s;
  save();
}

export function setComplianceRan(v: boolean): void {
  getStore().complianceRan = v;
  save();
}

export function setReconciliation(ran: boolean, vendorSummary: VendorSummaryRow[]): void {
  const st = getStore();
  st.reconciliationRan = ran;
  st.vendorSummary = vendorSummary;
  save();
}

// ── User input: add travelers & expenses ──────
// Adding data invalidates derived results so the engine
// recomputes on the user's real input (a working tool,
// not a canned demo).
function invalidateDerived(): void {
  const st = getStore();
  st.netObligations = [];
  st.nettingSummary = null;
  st.complianceFlags = [];
  st.complianceRan = false;
  st.reconciliationResults = [];
  st.reconciliationRan = false;
  st.vendorSummary = [];
  st.claimLinks = [];
}

export function addEntity(e: Entity): void {
  getStore().entities.push(e);
  invalidateDerived();
  save();
}

export function addExpense(exp: Expense): void {
  getStore().expenses.push(exp);
  getStore().debtEdges = deriveDebtEdges(getStore().expenses);
  invalidateDerived();
  save();
}

export function deleteExpense(id: string): boolean {
  const st = getStore();
  const before = st.expenses.length;
  st.expenses = st.expenses.filter((e) => e.id !== id);
  if (st.expenses.length === before) return false;
  st.debtEdges = deriveDebtEdges(st.expenses);
  invalidateDerived();
  save();
  return true;
}

export function deleteEntity(id: string): boolean {
  const st = getStore();
  const before = st.entities.length;
  st.entities = st.entities.filter((e) => e.id !== id);
  if (st.entities.length === before) return false;
  st.expenses = st.expenses.filter((e) => e.payerId !== id && !e.participantIds.includes(id));
  st.debtEdges = deriveDebtEdges(st.expenses);
  invalidateDerived();
  save();
  return true;
}

// Start from a blank slate (a real tool, not a fixed demo).
export function clearStore(): void {
  const st = getStore();
  st.entities = [];
  st.expenses = [];
  st.debtEdges = [];
  st.ledger = [];
  invalidateDerived();
  save();
}
