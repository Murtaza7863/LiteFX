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
import {
  alignRailsToCountry,
  countryByCode,
  ME_CONTACT_ID,
  normalizeLinkedRails,
} from "./data/countries.js";

// ──────────────────────────────────────────────
// File-backed store. Each user owns a workspace of
// named trips. Auth context selects the user; the
// active trip (or a claim-link override) is what
// getStore() returns so requests cannot see each
// other's expenses.
// ──────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DEFAULT_OWNER = "user-local";
const SAMPLE_TRIP_NAME = "Bangkok Trip 2026";
const MAX_TRIPS = 40;
const MAX_CONTACTS = 80;
const als = new AsyncLocalStorage<string>();
const tripAls = new AsyncLocalStorage<string>();

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
  country?: string;
  linkedRailAliases?: { railType: string; alias: string }[];
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
  country?: string;
  linkedRailAliases?: { railType: string; alias: string }[];
}

export interface TripRecord extends StoreState {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedContact {
  id: string;
  name: string;
  country: string;
  contact: { type: "email" | "phone"; value: string };
  linkedRailAliases: { railType: string; alias: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface UserWorkspace {
  activeTripId: string;
  trips: Record<string, TripRecord>;
  contacts: SavedContact[];
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

/** Bump when the sample crew's default rails change so old Pages DBs catch up. */
const SAMPLE_ACCOUNTS = 1;

export interface AppState {
  version: 3;
  sampleAccounts?: number;
  users: UserRecord[];
  sessions: SessionRecord[];
  workspaces: Record<string, UserWorkspace>;
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
  return {
    version: 3,
    sampleAccounts: SAMPLE_ACCOUNTS,
    users: [],
    sessions: [],
    workspaces: {},
  };
}

function dropDerivedSettlement(trip: StoreState): void {
  trip.netObligations = [];
  trip.nettingSummary = null;
  trip.claimLinks = [];
  trip.complianceFlags = [];
  trip.complianceRan = false;
  trip.reconciliationResults = [];
  trip.reconciliationRan = false;
  trip.vendorSummary = [];
}

/** Old sample trips left Eve with no account. Restore seed rails once. */
function restoreSampleAccounts(trip: StoreState): boolean {
  const byId = new Map(SEED_ENTITIES.map((e) => [e.id, e]));
  let changed = false;
  for (const e of trip.entities) {
    const seed = byId.get(e.id);
    if (!seed || seed.linkedRailAliases.length === 0) continue;
    if (e.linkedRailAliases.length > 0) continue;
    e.linkedRailAliases = structuredClone(seed.linkedRailAliases);
    changed = true;
  }
  if (changed) dropDerivedSettlement(trip);
  return changed;
}

function coerceUser(u: UserRecord): UserRecord {
  const country =
    typeof u.country === "string" && countryByCode(u.country)
      ? u.country.toUpperCase()
      : undefined;
  const linked = Array.isArray(u.linkedRailAliases)
    ? country
      ? alignRailsToCountry(country, u.linkedRailAliases, false)
      : []
    : [];
  return { ...u, country, linkedRailAliases: linked };
}

function finishApp(state: AppState): AppState {
  state.users = (state.users ?? []).map(coerceUser);
  if ((state.sampleAccounts ?? 0) >= SAMPLE_ACCOUNTS) return state;
  for (const ws of Object.values(state.workspaces)) {
    for (const trip of Object.values(ws.trips)) restoreSampleAccounts(trip);
  }
  state.sampleAccounts = SAMPLE_ACCOUNTS;
  return state;
}

function ownerId(): string {
  return als.getStore() ?? DEFAULT_OWNER;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newTripId(): string {
  return `trip-${Math.random().toString(36).slice(2, 10)}`;
}

export function validateTripName(raw: string | undefined): string | null {
  const name = (raw ?? "").trim();
  if (!name || name.length > 80) return null;
  return name;
}

function uniqueTripName(ws: UserWorkspace, base: string): string {
  const taken = new Set(
    Object.values(ws.trips).map((t) => t.name.toLowerCase()),
  );
  const fit = (s: string) => s.slice(0, 80).trimEnd() || "Trip";
  const clipped = fit(base);
  if (!taken.has(clipped.toLowerCase())) return clipped;
  for (let n = 2; n < 200; n++) {
    const suffix = ` (${n})`;
    const candidate = fit(
      `${clipped.slice(0, Math.max(1, 80 - suffix.length))}${suffix}`,
    );
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return fit(`${clipped.slice(0, 67)} ${Date.now()}`);
}

function copyTripName(name: string): string {
  const suffix = " (copy)";
  if (name.length + suffix.length <= 80) return `${name}${suffix}`;
  return `${name.slice(0, 80 - suffix.length).trimEnd()}${suffix}`;
}

function inferTripName(state: StoreState): string {
  const hay = (state.expenses ?? [])
    .map((e) => e.description)
    .join(" ")
    .toLowerCase();
  if (hay.includes("bangkok")) return SAMPLE_TRIP_NAME;
  if ((state.entities?.length ?? 0) > 0 || (state.expenses?.length ?? 0) > 0) {
    return "My trip";
  }
  return "New trip";
}

function emptyWorkspace(): UserWorkspace {
  const t = blankTrip();
  return { activeTripId: t.id, trips: { [t.id]: t }, contacts: [] };
}

function coerceContacts(raw: unknown): SavedContact[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedContact[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Partial<SavedContact>;
    const name = (c.name ?? "").trim().slice(0, 80);
    const country = (c.country ?? "").trim().toUpperCase();
    if (!name || !country) continue;
    const contact =
      c.contact && (c.contact.type === "email" || c.contact.type === "phone")
        ? { type: c.contact.type, value: (c.contact.value ?? "").trim() }
        : { type: "email" as const, value: "" };
    out.push({
      id: c.id || `ppl-${Math.random().toString(36).slice(2, 10)}`,
      name,
      country,
      contact,
      linkedRailAliases: alignRailsToCountry(
        country,
        Array.isArray(c.linkedRailAliases) ? c.linkedRailAliases : [],
        true,
      ),
      createdAt: c.createdAt || nowIso(),
      updatedAt: c.updatedAt || nowIso(),
    });
    if (out.length >= MAX_CONTACTS) break;
  }
  return out;
}

function blankTrip(name = "New trip"): TripRecord {
  const t = nowIso();
  return {
    ...freshState(),
    id: newTripId(),
    name,
    createdAt: t,
    updatedAt: t,
  };
}

function wrapTrip(
  state: Partial<StoreState> & Partial<TripRecord>,
  opts?: { id?: string; name?: string },
): TripRecord {
  const coerced = coerceTrip(state);
  return {
    ...coerced,
    id: state.id || opts?.id || newTripId(),
    name: (state.name || opts?.name || inferTripName(coerced)).slice(0, 80),
    createdAt: state.createdAt || nowIso(),
    updatedAt: state.updatedAt || nowIso(),
  };
}

function isWorkspace(v: unknown): v is UserWorkspace {
  return (
    !!v &&
    typeof v === "object" &&
    "activeTripId" in v &&
    "trips" in v &&
    typeof (v as UserWorkspace).trips === "object"
  );
}

function looksLikeStore(v: unknown): v is Partial<StoreState> {
  return (
    !!v &&
    typeof v === "object" &&
    (Array.isArray((v as StoreState).entities) ||
      Array.isArray((v as StoreState).expenses))
  );
}

function migrateWorkspace(raw: unknown): UserWorkspace {
  if (isWorkspace(raw)) {
    const trips: Record<string, TripRecord> = {};
    for (const [id, trip] of Object.entries(raw.trips ?? {})) {
      trips[id] = wrapTrip(trip, { id });
    }
    if (Object.keys(trips).length === 0) {
      const t = blankTrip();
      trips[t.id] = t;
    }
    const active =
      raw.activeTripId && trips[raw.activeTripId]
        ? raw.activeTripId
        : Object.values(trips).sort((a, b) =>
            b.updatedAt.localeCompare(a.updatedAt),
          )[0].id;
    return {
      activeTripId: active,
      trips,
      contacts: coerceContacts(raw.contacts),
    };
  }
  if (looksLikeStore(raw)) {
    const trip = wrapTrip(raw);
    return { activeTripId: trip.id, trips: { [trip.id]: trip }, contacts: [] };
  }
  return emptyWorkspace();
}

export function normalizeApp(parsed: unknown): AppState | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Partial<AppState> & {
    trips?: Record<string, unknown>;
    entities?: unknown;
    expenses?: unknown;
  };
  const users = Array.isArray(p.users) ? p.users : [];
  const sessions = Array.isArray(p.sessions) ? p.sessions : [];

  if (p.version === 3 && p.workspaces && typeof p.workspaces === "object") {
    const workspaces: Record<string, UserWorkspace> = {};
    for (const [uid, ws] of Object.entries(p.workspaces)) {
      workspaces[uid] = migrateWorkspace(ws);
    }
    return finishApp({
      version: 3,
      sampleAccounts: p.sampleAccounts,
      users,
      sessions,
      workspaces,
    });
  }

  if (p.trips && typeof p.trips === "object") {
    const workspaces: Record<string, UserWorkspace> = {};
    for (const [uid, raw] of Object.entries(p.trips)) {
      workspaces[uid] = migrateWorkspace(raw);
    }
    return finishApp({ version: 3, users, sessions, workspaces });
  }

  if (p.entities || p.expenses) {
    const ws = migrateWorkspace(p);
    return finishApp({
      version: 3,
      users,
      sessions,
      workspaces: { [DEFAULT_OWNER]: ws },
    });
  }

  if (p.version === 3 || p.version === 2) {
    return finishApp({ version: 3, users, sessions, workspaces: {} });
  }
  return null;
}

function ensureWorkspace(uid: string): UserWorkspace {
  if (!app) app = emptyApp();
  if (!app.workspaces[uid]) {
    app.workspaces[uid] = emptyWorkspace();
  }
  const ws = app.workspaces[uid];
  if (!ws.contacts) ws.contacts = [];
  if (!ws.trips[ws.activeTripId]) {
    const first = Object.values(ws.trips)[0];
    if (first) ws.activeTripId = first.id;
    else {
      const t = blankTrip();
      ws.trips[t.id] = t;
      ws.activeTripId = t.id;
    }
  }
  return ws;
}

function currentTrip(): TripRecord {
  const ws = ensureWorkspace(ownerId());
  const override = tripAls.getStore();
  const id = override && ws.trips[override] ? override : ws.activeTripId;
  return ws.trips[id];
}

function summarizeTrip(t: TripRecord, activeId: string): TripSummary {
  return {
    id: t.id,
    name: t.name,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    active: t.id === activeId,
    travelerCount: t.entities.length,
    expenseCount: t.expenses.length,
    settledCount: t.netObligations.filter((o) => o.status === "settled").length,
    ledgerCount: t.ledger.length,
    netted: t.netObligations.length > 0,
  };
}

function save(): void {
  if (!app) return;
  const uid = als.getStore();
  if (uid && app.workspaces[uid]) {
    currentTrip().updatedAt = nowIso();
  }
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
    entities: (parsed.entities ?? []).map((e) => ({
      ...e,
      linkedRailAliases: alignRailsToCountry(
        e.country,
        e.linkedRailAliases,
        true,
      ),
    })),
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
  const railsChanged = (parsed.entities ?? []).some((e, i) => {
    const next = merged.entities[i];
    return (
      JSON.stringify(e.linkedRailAliases ?? []) !==
      JSON.stringify(next?.linkedRailAliases ?? [])
    );
  });
  if (fxChanged || railsChanged || Math.abs(oldSum - newSum) > 0.005) {
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
  for (const ws of Object.values(app!.workspaces)) {
    for (const trip of Object.values(ws.trips)) {
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
  }
  if (changed) save();
}

function load(): AppState | null {
  try {
    const file = dbFile();
    if (!existsSync(file)) return null;
    const raw = readFileSync(file, "utf8");
    return normalizeApp(JSON.parse(raw));
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
    ) => Promise<PersistenceAdapter & { load(): Promise<unknown> }>;
  };
  const adapter = await createPostgresPersistence(connectionString);
  const loaded = await adapter.load();
  app = normalizeApp(loaded) ?? emptyApp();
  persistence = adapter;
  await adapter.save(structuredClone(app));
}

export function getApp(): AppState {
  initStore();
  return app!;
}

export function getStore(): TripRecord {
  initStore();
  return currentTrip();
}

export function runAsUser<T>(userId: string, fn: () => T): T {
  return als.run(userId, fn);
}

export function runAsTrip<T>(tripId: string, fn: () => T): T {
  return tripAls.run(tripId, fn);
}

export function seedStore(name = SAMPLE_TRIP_NAME): void {
  initStore();
  const ws = ensureWorkspace(ownerId());
  const current = ws.trips[ws.activeTripId];
  const seeded = wrapTrip(sampleState(), {
    id: current.id,
    name,
  });
  seeded.createdAt = current.createdAt;
  seeded.updatedAt = nowIso();
  seeded.expenses = seeded.expenses.map((e) => ({ ...e, tripId: current.id }));
  ws.trips[current.id] = seeded;
  save();
}

export function loadSampleTrip(): TripRecord | { error: string } {
  initStore();
  const ws = ensureWorkspace(ownerId());
  const current = ws.trips[ws.activeTripId];
  const occupied = current.entities.length > 0 || current.expenses.length > 0;
  const name = uniqueTripName(ws, SAMPLE_TRIP_NAME);
  if (occupied) {
    const created = createTrip(name);
    if ("error" in created) return created;
  }
  seedStore(occupied ? name : SAMPLE_TRIP_NAME);
  return currentTrip();
}

export function resetApp(): void {
  app = emptyApp();
  save();
}

export function toPublicUser(u: UserRecord): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    country: u.country,
    linkedRailAliases: u.linkedRailAliases ?? [],
  };
}

export function updateUserProfile(
  userId: string,
  patch: {
    country?: string | null;
    linkedRailAliases?: { railType: string; alias: string }[];
  },
): PublicUser | { error: string } {
  initStore();
  const u = findUserById(userId);
  if (!u) return { error: "Account not found." };
  if (patch.country !== undefined) {
    if (patch.country == null || !String(patch.country).trim()) {
      u.country = undefined;
      u.linkedRailAliases = [];
    } else {
      const code = String(patch.country).trim().toUpperCase();
      if (!countryByCode(code)) return { error: "Unsupported country." };
      const countryChanged = u.country !== code;
      u.country = code;
      if (patch.linkedRailAliases !== undefined) {
        const normalized = normalizeLinkedRails(code, patch.linkedRailAliases);
        if ("error" in normalized) return normalized;
        u.linkedRailAliases = normalized.linkedRailAliases;
      } else {
        u.linkedRailAliases = alignRailsToCountry(
          code,
          u.linkedRailAliases ?? [],
          countryChanged,
        );
      }
    }
  } else if (patch.linkedRailAliases !== undefined) {
    if (!u.country) {
      return { error: "Set your country before adding payment methods." };
    }
    const normalized = normalizeLinkedRails(u.country, patch.linkedRailAliases);
    if ("error" in normalized) return normalized;
    u.linkedRailAliases = normalized.linkedRailAliases;
  }
  persistProfileContact(u);
  save();
  return toPublicUser(u);
}

function persistProfileContact(u: UserRecord): void {
  if (!u.country) return;
  const email = u.email.endsWith("@litefx.local") ? "" : u.email;
  upsertContact({
    id: ME_CONTACT_ID,
    name: u.name,
    country: u.country,
    contact: { type: "email", value: email },
    linkedRailAliases: u.linkedRailAliases ?? [],
  });
  const ws = ensureWorkspace(u.id);
  for (const trip of Object.values(ws.trips)) {
    const mine = trip.entities.find((e) => e.contactId === ME_CONTACT_ID);
    if (!mine) continue;
    runAsTrip(trip.id, () => {
      updateEntity(mine.id, {
        name: u.name,
        country: u.country,
        linkedRailAliases: u.linkedRailAliases ?? [],
        contact: { type: "email", value: email || mine.contact.value },
      });
    });
  }
}

export function addMeToTrip(): Entity | { error: string } {
  initStore();
  const u = findUserById(ownerId());
  if (!u) return { error: "Sign in required." };
  if (!u.country || !countryByCode(u.country)) {
    return { error: "Set your country in Payment methods first." };
  }
  persistProfileContact(u);
  return addEntityFromContact(ME_CONTACT_ID);
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
  const orphan = st.workspaces[DEFAULT_OWNER];
  const orphanHasData =
    orphan &&
    Object.values(orphan.trips).some(
      (t) => t.entities.length > 0 || t.expenses.length > 0,
    );
  if (st.users.length === 1 && orphanHasData) {
    st.workspaces[user.id] = orphan;
    delete st.workspaces[DEFAULT_OWNER];
  } else if (!st.workspaces[user.id]) {
    st.workspaces[user.id] = emptyWorkspace();
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

export function findClaimContext(
  token: string,
): { ownerId: string; tripId: string } | undefined {
  initStore();
  for (const [uid, ws] of Object.entries(app!.workspaces)) {
    for (const trip of Object.values(ws.trips)) {
      if (trip.claimLinks.some((c) => c.token === token)) {
        return { ownerId: uid, tripId: trip.id };
      }
    }
  }
}

export function findClaimOwner(token: string): string | undefined {
  return findClaimContext(token)?.ownerId;
}

export function withClaimTrip<T>(token: string, fn: () => T): T | undefined {
  const ctx = findClaimContext(token);
  if (!ctx) return undefined;
  return runAsUser(ctx.ownerId, () => runAsTrip(ctx.tripId, fn));
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
  for (const ws of Object.values(app!.workspaces)) {
    for (const trip of Object.values(ws.trips)) {
      const cl = trip.claimLinks.find((c) => c.token === token);
      if (cl) return cl;
    }
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
  e.linkedRailAliases = alignRailsToCountry(
    e.country,
    e.linkedRailAliases,
    false,
  );
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
    Pick<
      Entity,
      "name" | "country" | "contact" | "linkedRailAliases" | "contactId"
    >
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
  e.linkedRailAliases = alignRailsToCountry(
    e.country,
    e.linkedRailAliases,
    countryChanged,
  );
  if (patch.contactId !== undefined) e.contactId = patch.contactId;
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
  const ws = ensureWorkspace(ownerId());
  const current = ws.trips[ws.activeTripId];
  ws.trips[current.id] = {
    ...freshState(),
    id: current.id,
    name: current.name,
    createdAt: current.createdAt,
    updatedAt: nowIso(),
  };
  save();
}

export function listTripSummaries(): TripSummary[] {
  initStore();
  const ws = ensureWorkspace(ownerId());
  return Object.values(ws.trips)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((t) => summarizeTrip(t, ws.activeTripId));
}

export function currentTripSummary(): TripSummary {
  initStore();
  const ws = ensureWorkspace(ownerId());
  return summarizeTrip(currentTrip(), ws.activeTripId);
}

export function createTrip(nameRaw?: string): TripRecord | { error: string } {
  initStore();
  const requested = validateTripName(nameRaw || "New trip");
  if (!requested) return { error: "Trip name must be 1–80 characters." };
  const ws = ensureWorkspace(ownerId());
  if (Object.keys(ws.trips).length >= MAX_TRIPS) {
    return { error: `You can keep up to ${MAX_TRIPS} trips.` };
  }
  const trip = blankTrip(uniqueTripName(ws, requested));
  ws.trips[trip.id] = trip;
  ws.activeTripId = trip.id;
  save();
  return trip;
}

export function selectTrip(id: string): boolean {
  initStore();
  const ws = ensureWorkspace(ownerId());
  if (!ws.trips[id]) return false;
  ws.activeTripId = id;
  save();
  return true;
}

export function renameTrip(
  id: string,
  nameRaw: string,
): TripRecord | { error: string } {
  initStore();
  const name = validateTripName(nameRaw);
  if (!name) return { error: "Trip name must be 1–80 characters." };
  const ws = ensureWorkspace(ownerId());
  const trip = ws.trips[id];
  if (!trip) return { error: "Trip not found." };
  trip.name = name;
  trip.updatedAt = nowIso();
  save();
  return trip;
}

export function deleteTrip(id: string): { ok: true } | { error: string } {
  initStore();
  const ws = ensureWorkspace(ownerId());
  if (!ws.trips[id]) return { error: "Trip not found." };
  if (Object.keys(ws.trips).length <= 1) {
    return { error: "Keep at least one trip. Clear it instead." };
  }
  delete ws.trips[id];
  if (ws.activeTripId === id) {
    const next = Object.values(ws.trips).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    )[0];
    ws.activeTripId = next.id;
  }
  save();
  return { ok: true };
}

export function listContacts(): SavedContact[] {
  initStore();
  return [...ensureWorkspace(ownerId()).contacts].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

function contactKey(name: string, country: string): string {
  return `${name.trim().toLowerCase()}|${country.trim().toUpperCase()}`;
}

export function travelerOnTrip(
  name: string,
  country: string,
  exceptId?: string,
): Entity | undefined {
  const key = contactKey(name, country);
  return getStore().entities.find(
    (e) => e.id !== exceptId && contactKey(e.name, e.country) === key,
  );
}

export function upsertContact(person: {
  id?: string;
  name: string;
  country: string;
  contact: { type: "email" | "phone"; value: string };
  linkedRailAliases: { railType: string; alias: string }[];
}): SavedContact | { error: string } {
  initStore();
  const name = person.name.trim();
  if (!name || name.length > 80) {
    return { error: "Name must be 1–80 characters." };
  }
  const ws = ensureWorkspace(ownerId());
  const now = nowIso();
  const byId = person.id
    ? ws.contacts.find((c) => c.id === person.id)
    : undefined;
  const byName = ws.contacts.find(
    (c) => contactKey(c.name, c.country) === contactKey(name, person.country),
  );
  const existing = byId ?? byName;
  if (existing) {
    existing.name = name;
    existing.country = person.country;
    existing.contact = person.contact;
    existing.linkedRailAliases = alignRailsToCountry(
      person.country,
      person.linkedRailAliases,
      true,
    );
    existing.updatedAt = now;
    save();
    return existing;
  }
  if (ws.contacts.length >= MAX_CONTACTS) {
    return { error: `You can save up to ${MAX_CONTACTS} people.` };
  }
  const saved: SavedContact = {
    id: person.id?.trim() || `ppl-${Math.random().toString(36).slice(2, 10)}`,
    name,
    country: person.country,
    contact: person.contact,
    linkedRailAliases: alignRailsToCountry(
      person.country,
      person.linkedRailAliases,
      true,
    ),
    createdAt: now,
    updatedAt: now,
  };
  ws.contacts.push(saved);
  save();
  return saved;
}

export function deleteContact(id: string): boolean {
  initStore();
  const ws = ensureWorkspace(ownerId());
  const before = ws.contacts.length;
  ws.contacts = ws.contacts.filter((c) => c.id !== id);
  if (ws.contacts.length === before) return false;
  for (const trip of Object.values(ws.trips)) {
    for (const e of trip.entities) {
      if (e.contactId === id) delete e.contactId;
    }
  }
  save();
  return true;
}

function asSavedContact(c: Entity["contact"]): {
  type: "email" | "phone";
  value: string;
} {
  return {
    type: c.type === "phone" ? "phone" : "email",
    value: c.value,
  };
}

/** Upsert this traveler into the account address book. */
export function rememberTraveler(entity: Entity): Entity {
  initStore();
  const saved = upsertContact({
    id: entity.contactId,
    name: entity.name,
    country: entity.country,
    contact: asSavedContact(entity.contact),
    linkedRailAliases: entity.linkedRailAliases,
  });
  if ("error" in saved) return entity;
  if (saved.id === entity.contactId) return entity;
  return (
    updateEntity(entity.id, { contactId: saved.id }) ?? {
      ...entity,
      contactId: saved.id,
    }
  );
}

/** Save everyone on the active trip so they can be reused later. */
export function saveTripCrew(): SavedContact[] {
  initStore();
  for (const e of getStore().entities) rememberTraveler(e);
  return listContacts();
}

export function createTraveler(
  entity: Entity,
  saveContact = true,
): Entity | { error: string } {
  initStore();
  if (entity.contactId) {
    const taken = getStore().entities.find(
      (e) => e.contactId === entity.contactId,
    );
    if (taken) {
      return { error: `${taken.name.trim()} is already on this trip.` };
    }
  }
  const dup = travelerOnTrip(entity.name, entity.country);
  if (dup) {
    return { error: `${dup.name.trim()} is already on this trip.` };
  }
  let contactId = entity.contactId;
  if (saveContact) {
    const saved = upsertContact({
      id: entity.contactId,
      name: entity.name,
      country: entity.country,
      contact: entity.contact,
      linkedRailAliases: entity.linkedRailAliases,
    });
    if (!("error" in saved)) contactId = saved.id;
  }
  const next = { ...entity, contactId };
  addEntity(next);
  return next;
}

export function addEntityFromContact(
  contactId: string,
): Entity | { error: string } {
  initStore();
  const saved = ensureWorkspace(ownerId()).contacts.find(
    (c) => c.id === contactId,
  );
  if (!saved) return { error: "Saved person not found." };
  return createTraveler(
    {
      id: `ent-u${Math.random().toString(36).slice(2, 7)}`,
      name: saved.name,
      country: saved.country,
      contact: saved.contact,
      linkedRailAliases: structuredClone(saved.linkedRailAliases),
      contactId: saved.id,
    },
    false,
  );
}

export function duplicateTrip(
  sourceId?: string,
): TripRecord | { error: string } {
  initStore();
  const ws = ensureWorkspace(ownerId());
  const src = ws.trips[sourceId || ws.activeTripId];
  if (!src) return { error: "Trip not found." };
  const created = createTrip(copyTripName(src.name));
  if ("error" in created) return created;
  const idMap: Record<string, string> = {};
  const entities = src.entities.map((e) => {
    const id = `ent-u${Math.random().toString(36).slice(2, 7)}`;
    idMap[e.id] = id;
    return { ...structuredClone(e), id };
  });
  const expenses = src.expenses.map((e) => {
    const parts = e.split?.parts
      ? Object.fromEntries(
          Object.entries(e.split.parts).map(([k, v]) => [idMap[k] ?? k, v]),
        )
      : e.split?.parts;
    return {
      ...structuredClone(e),
      id: `exp-u${Math.random().toString(36).slice(2, 7)}`,
      tripId: created.id,
      payerId: idMap[e.payerId] ?? e.payerId,
      participantIds: e.participantIds.map((p) => idMap[p] ?? p),
      split:
        e.split && e.split.mode !== "equal"
          ? { mode: e.split.mode, parts }
          : e.split,
    };
  });
  const dest = ws.trips[created.id];
  dest.entities = entities;
  dest.expenses = expenses;
  dest.debtEdges = deriveDebtEdges(expenses);
  dest.updatedAt = nowIso();
  save();
  return dest;
}
