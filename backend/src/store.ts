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
}

function deriveDebtEdges(expenses: Expense[]): DebtEdge[] {
  const edges: DebtEdge[] = [];
  let counter = 0;
  for (const exp of expenses) {
    const share = exp.amount / exp.participantIds.length;
    for (const pid of exp.participantIds) {
      if (pid === exp.payerId) continue;
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
    ledger: [],
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
