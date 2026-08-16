import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";
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
import { getFxSnapshot } from "./fx.js";
import { SEED_ENTITIES, SEED_EXPENSES, SEED_INVOICES } from "./data/seed.js";

// ──────────────────────────────────────────────
// File-backed store. Users each own a trip. Auth
// context (AsyncLocalStorage) selects which trip
// getStore() returns so requests cannot see each
// other's expenses.
// ──────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DEFAULT_OWNER = "user-local";
const als = new AsyncLocalStorage<string>();

function dbFile(): string {
  const envPath =
    typeof process !== "undefined" ? process.env.LITEFX_DB_PATH : undefined;
  return envPath ? path.resolve(envPath) : path.join(DATA_DIR, "db.json");
}

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
  fxAsOf: string | null;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
}

export interface AppState {
  version: 2;
  users: UserRecord[];
  sessions: SessionRecord[];
  trips: Record<string, StoreState>;
}

interface PersistenceAdapter {
  save(state: AppState): Promise<void>;
}

function deriveDebtEdges(expenses: Expense[]): DebtEdge[] {
  const edges: DebtEdge[] = [];
  let counter = 0;
  for (const exp of expenses) {
    const shares = computeShares(exp);
    for (const pid of exp.participantIds) {
      if (pid === exp.payerId) continue;
      const owed = shares[pid] ?? 0;
      if (!Number.isFinite(owed) || owed <= 0) continue;
      const currency = exp.currency;
      const amount = Math.round(owed * 100) / 100;
      if (!Number.isFinite(amount) || amount <= 0) continue;
      edges.push({
        id: `debt-${++counter}`,
        from: pid,
        to: exp.payerId,
        amount,
        currency,
        amountUsd: toUsd(amount, currency),
        sourceExpenseId: exp.id,
      });
    }
  }
  return edges;
}

// The portion of the bill each participant is responsible for.
// Supports equal, percentage, and exact-amount splits (Splitwise baseline).
function computeShares(exp: Expense): Record<string, number> {
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
    if (remainderPct > 0)
      shares[exp.payerId] =
        (shares[exp.payerId] ?? 0) + (exp.amount * remainderPct) / 100;
  } else if (mode === "amount") {
    let assigned = 0;
    for (const pid of exp.participantIds) {
      const amt = parts[pid] ?? 0;
      shares[pid] = amt;
      assigned += amt;
    }
    const remainder = exp.amount - assigned;
    if (remainder > 0)
      shares[exp.payerId] = (shares[exp.payerId] ?? 0) + remainder;
  } else {
    const ids = exp.participantIds;
    const count = ids.length || 1;
    const cents = Math.round(exp.amount * 100);
    const base = Math.floor(cents / count);
    const extra = cents - base * count;
    const remainderTo = ids.includes(exp.payerId)
      ? exp.payerId
      : ids[count - 1];
    for (const pid of ids) {
      shares[pid] = (base + (pid === remainderTo ? extra : 0)) / 100;
    }
  }
  return shares;
}

/** Reject split payloads that would produce NaN / overflowing shares. */
export function validateExpenseSplit(
  split: { mode?: string; parts?: Record<string, number> } | undefined,
  amount: number,
): string | null {
  if (!split || split.mode === "equal") return null;
  if (split.mode !== "percent" && split.mode !== "amount") {
    return "Split mode must be equal, percent, or amount.";
  }
  const parts = split.parts ?? {};
  let assigned = 0;
  for (const v of Object.values(parts)) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) {
      return "Split shares must be finite numbers ≥ 0.";
    }
    assigned += n;
  }
  if (split.mode === "percent" && assigned > 100.01) {
    return "Percent shares cannot exceed 100%.";
  }
  if (split.mode === "amount" && assigned > amount + 0.01) {
    return "Assigned amounts cannot exceed the expense total.";
  }
  return null;
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
    fxAsOf: getFxSnapshot().asOf,
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

let app: AppState | null = null;
let persistence: PersistenceAdapter | null = null;
let persistenceError: string | null = null;

function emptyApp(): AppState {
  return { version: 2, users: [], sessions: [], trips: {} };
}

function ownerId(): string {
  return als.getStore() ?? DEFAULT_OWNER;
}

function ensureTrip(uid: string): StoreState {
  if (!app) app = emptyApp();
  if (!app.trips[uid]) app.trips[uid] = freshState();
  return app.trips[uid];
}

function save(): void {
  if (!app) return;
  if (persistence) {
    void persistence
      .save(structuredClone(app))
      .then(() => {
        persistenceError = null;
      })
      .catch((e) => {
        persistenceError = (e as Error).message;
        console.error(
          "[store] PostgreSQL persistence failed:",
          persistenceError,
        );
      });
    return;
  }
  try {
    const file = dbFile();
    const dir = path.dirname(file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const pid =
      typeof process !== "undefined" && process.pid ? process.pid : "web";
    const tmp = `${file}.${pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(app, null, 2));
    renameSync(tmp, file);
  } catch (e) {
    console.warn("[store] failed to persist:", (e as Error).message);
  }
}

export function persistenceStatus(): {
  mode: "postgres" | "json";
  healthy: boolean;
  error: string | null;
} {
  return {
    mode: persistence ? "postgres" : "json",
    healthy: persistenceError === null,
    error: persistenceError,
  };
}

function coerceTrip(parsed: Partial<StoreState>): StoreState {
  const base = freshState();
  const merged: StoreState = {
    ...base,
    ...parsed,
    entities: parsed.entities ?? [],
    expenses: parsed.expenses ?? [],
    debtEdges: parsed.debtEdges ?? [],
    netObligations: parsed.netObligations ?? [],
    claimLinks: parsed.claimLinks ?? [],
    complianceFlags: parsed.complianceFlags ?? [],
    invoices: parsed.invoices ?? [],
    reconciliationResults: parsed.reconciliationResults ?? [],
    ledger: parsed.ledger ?? [],
    nettingSummary: parsed.nettingSummary ?? null,
    complianceRan: !!parsed.complianceRan,
    reconciliationRan: !!parsed.reconciliationRan,
    vendorSummary: parsed.vendorSummary ?? [],
    fxAsOf: getFxSnapshot().asOf,
  };
  const repriced = deriveDebtEdges(merged.expenses);
  const oldSum = (parsed.debtEdges ?? []).reduce(
    (s, e) => s + (e.amountUsd ?? 0),
    0,
  );
  const newSum = repriced.reduce((s, e) => s + e.amountUsd, 0);
  merged.debtEdges = repriced;
  const fxChanged = parsed.fxAsOf !== merged.fxAsOf;
  if (fxChanged || Math.abs(oldSum - newSum) > 0.005) {
    merged.netObligations = [];
    merged.nettingSummary = null;
    merged.claimLinks = [];
    merged.complianceFlags = [];
    merged.complianceRan = false;
    merged.reconciliationResults = [];
    merged.reconciliationRan = false;
    merged.vendorSummary = [];
  }
  return merged;
}

export function refreshDerivedForFx(): void {
  initStore();
  const asOf = getFxSnapshot().asOf;
  let changed = false;
  for (const trip of Object.values(app!.trips)) {
    if (trip.fxAsOf === asOf) continue;
    trip.debtEdges = deriveDebtEdges(trip.expenses);
    trip.netObligations = [];
    trip.nettingSummary = null;
    trip.claimLinks = [];
    trip.complianceFlags = [];
    trip.complianceRan = false;
    trip.reconciliationResults = [];
    trip.reconciliationRan = false;
    trip.vendorSummary = [];
    trip.fxAsOf = asOf;
    changed = true;
  }
  if (changed) save();
}

function load(): AppState | null {
  try {
    const file = dbFile();
    if (!existsSync(file)) return null;
    const raw = readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppState> & Partial<StoreState>;
    if (
      parsed.version === 2 &&
      parsed.trips &&
      typeof parsed.trips === "object"
    ) {
      const trips: Record<string, StoreState> = {};
      for (const [id, trip] of Object.entries(parsed.trips)) {
        trips[id] = coerceTrip(trip);
      }
      return {
        version: 2,
        users: Array.isArray(parsed.users) ? parsed.users : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        trips,
      };
    }
    if (parsed.entities || parsed.expenses) {
      return {
        version: 2,
        users: [],
        sessions: [],
        trips: { [DEFAULT_OWNER]: coerceTrip(parsed) },
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function initStore(): void {
  if (app) return;
  app = load() ?? emptyApp();
  save();
}

export async function initPersistentStore(): Promise<void> {
  if (app) return;
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    initStore();
    return;
  }
  const modulePath = "./postgres.js";
  const { createPostgresPersistence } = (await import(
    /* @vite-ignore */ modulePath
  )) as {
    createPostgresPersistence: (
      url: string,
    ) => Promise<PersistenceAdapter & { load(): Promise<AppState | null> }>;
  };
  const adapter = await createPostgresPersistence(connectionString);
  const loaded = await adapter.load();
  app = loaded ?? emptyApp();
  persistence = adapter;
  await adapter.save(structuredClone(app));
}

export function getApp(): AppState {
  initStore();
  return app!;
}

export function getStore(): StoreState {
  initStore();
  return ensureTrip(ownerId());
}

export function runAsUser<T>(userId: string, fn: () => T): T {
  return als.run(userId, fn);
}

export function seedStore(): void {
  initStore();
  app!.trips[ownerId()] = sampleState();
  save();
}

export function resetApp(): void {
  app = emptyApp();
  save();
}

export function toPublicUser(u: UserRecord): PublicUser {
  return { id: u.id, email: u.email, name: u.name };
}

export function findUserByEmail(email: string): UserRecord | undefined {
  return getApp().users.find((u) => u.email === email);
}

export function findUserById(id: string): UserRecord | undefined {
  return getApp().users.find((u) => u.id === id);
}

export function addUser(user: UserRecord): void {
  const st = getApp();
  st.users.push(user);
  const orphan = st.trips[DEFAULT_OWNER];
  const orphanHasData =
    orphan && (orphan.entities.length > 0 || orphan.expenses.length > 0);
  if (st.users.length === 1 && orphanHasData) {
    st.trips[user.id] = orphan;
    delete st.trips[DEFAULT_OWNER];
  } else if (!st.trips[user.id]) {
    st.trips[user.id] = freshState();
  }
  save();
}

export function addSession(session: SessionRecord): void {
  const st = getApp();
  const existing = st.sessions.filter((s) => s.userId === session.userId);
  if (existing.length >= 10) {
    existing
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, existing.length - 9)
      .forEach((old) => {
        st.sessions = st.sessions.filter((s) => s.id !== old.id);
      });
  }
  st.sessions.push(session);
  save();
}

export function findSessionByTokenHash(
  tokenHash: string,
): SessionRecord | undefined {
  const now = Date.now();
  return getApp().sessions.find(
    (s) => s.tokenHash === tokenHash && new Date(s.expiresAt).getTime() > now,
  );
}

export function deleteSessionByTokenHash(tokenHash: string): void {
  const st = getApp();
  st.sessions = st.sessions.filter((s) => s.tokenHash !== tokenHash);
  save();
}

export function deleteSessionsForUser(userId: string): void {
  const st = getApp();
  st.sessions = st.sessions.filter((s) => s.userId !== userId);
  save();
}

export function pruneExpiredSessions(): void {
  const st = getApp();
  const now = Date.now();
  const next = st.sessions.filter((s) => new Date(s.expiresAt).getTime() > now);
  if (next.length !== st.sessions.length) {
    st.sessions = next;
    save();
  }
}

export function findClaimOwner(token: string): string | undefined {
  initStore();
  for (const [uid, trip] of Object.entries(app!.trips)) {
    if (trip.claimLinks.some((c) => c.token === token)) return uid;
  }
}

// Convenience getters
export function getEntity(id: string): Entity | undefined {
  return getStore().entities.find((e) => e.id === id);
}

export function getNetObligation(id: string): NetObligation | undefined {
  return getStore().netObligations.find((o) => o.id === id);
}

export function updateNetObligation(
  id: string,
  patch: Partial<NetObligation>,
): void {
  const ob = getStore().netObligations.find((o) => o.id === id);
  if (ob) Object.assign(ob, patch);
  save();
}

export function getClaimLink(token: string): ClaimLink | undefined {
  initStore();
  for (const trip of Object.values(app!.trips)) {
    const cl = trip.claimLinks.find((c) => c.token === token);
    if (cl) return cl;
  }
}

export function updateClaimLink(
  token: string,
  patch: Partial<ClaimLink>,
): void {
  const cl = getClaimLink(token);
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

export function setReconciliationResults(
  results: ReconciliationResult[],
): void {
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

export function setReconciliation(
  ran: boolean,
  vendorSummary: VendorSummaryRow[],
): void {
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
  st.invoices = [];
}

/** Wipe engine outputs (not invoices) before a fresh netting pass. */
export function resetEngineOutputs(): void {
  const st = getStore();
  st.netObligations = [];
  st.nettingSummary = null;
  st.complianceFlags = [];
  st.complianceRan = false;
  st.reconciliationResults = [];
  st.reconciliationRan = false;
  st.vendorSummary = [];
  st.claimLinks = [];
  save();
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

export function updateEntity(
  id: string,
  patch: Partial<
    Pick<Entity, "name" | "country" | "contact" | "linkedRailAliases">
  >,
): Entity | null {
  const st = getStore();
  const e = st.entities.find((x) => x.id === id);
  if (!e) return null;
  const countryChanged = (patch.country ?? e.country) !== e.country;
  if (patch.name !== undefined) e.name = patch.name;
  if (patch.country !== undefined) e.country = patch.country;
  if (patch.contact !== undefined) e.contact = patch.contact;
  if (patch.linkedRailAliases !== undefined)
    e.linkedRailAliases = patch.linkedRailAliases;
  if (patch.name && st.nettingSummary) {
    for (const b of st.nettingSummary.balances) {
      if (b.entityId === id) b.entityName = patch.name;
    }
  }
  // Country changes the corridor graph, so nets must be rebuilt.
  // Linking a rail does not — callers re-route unsettled transfers.
  if (countryChanged) invalidateDerived();
  save();
  return e;
}

export function updateExpense(id: string, next: Expense): Expense | null {
  const st = getStore();
  const i = st.expenses.findIndex((e) => e.id === id);
  if (i < 0) return null;
  const prev = st.expenses[i];
  const moneyChanged =
    prev.payerId !== next.payerId ||
    prev.amount !== next.amount ||
    prev.currency !== next.currency ||
    prev.participantIds.join() !== next.participantIds.join() ||
    JSON.stringify(prev.split ?? null) !== JSON.stringify(next.split ?? null);
  st.expenses[i] = next;
  if (moneyChanged) {
    st.debtEdges = deriveDebtEdges(st.expenses);
    invalidateDerived();
  }
  save();
  return st.expenses[i];
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
  const kept: Expense[] = [];
  for (const e of st.expenses) {
    if (e.payerId === id) continue;
    const participantIds = e.participantIds.filter((p) => p !== id);
    if (participantIds.length === 0) continue;
    kept.push(
      participantIds.length === e.participantIds.length
        ? e
        : { ...e, participantIds },
    );
  }
  st.expenses = kept;
  st.debtEdges = deriveDebtEdges(st.expenses);
  invalidateDerived();
  save();
  return true;
}

// Start from a blank slate (a real tool, not a fixed demo).
export function clearStore(): void {
  initStore();
  app!.trips[ownerId()] = freshState();
  save();
}
