// ──────────────────────────────────────────────
// Core data models for LiteFX (cross-border netting & settlement).
// See README for the full entity-relationship overview.
// ──────────────────────────────────────────────

export type RailType = "local" | "linked" | "claim_link" | "stable_bridge";

export interface RailAlias {
  railType: string; // e.g. "paynow", "promptpay", "zelle", "sepa"
  alias: string; // phone or handle
}

export interface Entity {
  id: string;
  name: string;
  country: string; // ISO 3166-1 alpha-2: SG, TH, US, DE
  contact: { type: "email" | "phone"; value: string };
  linkedRailAliases: RailAlias[]; // empty if the recipient has no account
}

export interface ExpenseSplit {
  mode: "equal" | "percent" | "amount";
  // participantId -> percent (0-100) or exact amount, depending on mode
  parts?: Record<string, number>;
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
  split?: ExpenseSplit;
}

export interface DebtEdge {
  id: string;
  from: string; // entityId who owes
  to: string; // entityId who is owed
  amount: number;
  currency: string;
  amountUsd: number; // converted via mock FX table
  sourceExpenseId: string;
}

export interface NetObligation {
  id: string;
  from: string;
  to: string;
  amount: number; // in settlementCurrency
  settlementCurrency: string;
  amountUsd: number; // reference-currency amount (for internal math / display)
  status: "pending" | "routed" | "settled";
  chosenRail?: RailType;
  routingReason?: string;
  claimToken?: string;
  complianceFlags?: ComplianceFlag[];
  considered?: RailConsideration[]; // rails the router evaluated for this corridor
  feeUsd?: number;
  timeHours?: number;
}

// One rail the router evaluated for an obligation, so the UI can
// show the decision (chosen vs alternatives) rather than just the outcome.
export interface RailConsideration {
  type: RailType;
  railName: string;
  feeEstimatePct: number;
  timeEstimateHours: number;
  chosen: boolean;
  note: string;
}

export interface RailOption {
  type: RailType;
  corridor: [string, string]; // [countryA, countryB] — order-independent
  railName: string;
  feeEstimatePct: number;
  timeEstimateHours: number;
  requiresRecipientAccount: boolean;
}

export interface ClaimLink {
  token: string;
  obligationId: string;
  recipientId: string;
  recipientContact: string;
  status: "pending" | "claimed" | "expired";
  createdAt: string;
  expiresAt: string; // mock 7-day expiry
  payoutMethod?: string;
}

export interface ComplianceFlag {
  obligationId: string;
  type: "limit_exceeded" | "frequency_anomaly";
  message: string;
  severity: "warning" | "info";
}

export interface Invoice {
  id: string;
  vendorId: string; // entityId of the vendor / payer who fronted the booking
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

// A persisted record of an executed (simulated) settlement,
// giving the app a real double-entry-style ledger.
export interface SettlementRecord {
  id: string;
  obligationId: string;
  from: string;
  to: string;
  rail: RailType;
  amount: number;
  currency: string;
  amountUsd: number;
  status: "settled" | "claimed";
  timestamp: string;
}

// Persisted run-summaries so the UI can rehydrate after a reload.
export interface NettingSummary {
  rawEdgeCount: number;
  netEdgeCount: number;
  reductionRatio: number;
  balances: { entityId: string; entityName: string; netUsd: number }[];
}

export interface VendorSummaryRow {
  vendorId: string;
  vendorName: string;
  invoiceAmountUsd: number;
  settledUsd: number;
  pendingUsd: number;
}

// ──────────────────────────────────────────────
// FX table (MOCKED — in production this would call a live FX API
// such as Open Exchange Rates or the Wise/Fixer API).
// ──────────────────────────────────────────────

import { STATIC_FX, currencyOf } from "./data/countries";

// Live-overridable FX table (1 unit of currency = X USD), seeded from a
// broad static base so any supported country works out of the box.
export const FX_TABLE: Record<string, number> = { ...STATIC_FX };

export { currencyOf };

export function toUsd(amount: number, currency: string): number {
  const rate = FX_TABLE[currency] ?? 1;
  return Math.round(amount * rate * 100) / 100;
}

export function fromUsd(amountUsd: number, currency: string): number {
  const rate = FX_TABLE[currency] ?? 1;
  return Math.round((amountUsd / rate) * 100) / 100;
}

// ──────────────────────────────────────────────
// Mock per-corridor compliance limits (MOCKED — in production
// these would come from a compliance rules engine / sanctions screening).
// ──────────────────────────────────────────────

export const CORRIDOR_LIMITS: Record<string, number> = {
  // key format: "FROM_COUNTRY->TO_COUNTRY"
  "SG->SG": 20000,
  "TH->TH": 150000,
  "US->US": 10000,
  "DE->DE": 10000,
  "SG->TH": 5000,
  "TH->SG": 5000,
  "US->DE": 300,
  "DE->US": 300,
  "SG->US": 8000,
  "US->SG": 8000,
  "SG->DE": 8000,
  "DE->SG": 8000,
  "TH->US": 8000,
  "US->TH": 8000,
  "TH->DE": 8000,
  "DE->TH": 8000,
};

export const FREQUENCY_THRESHOLD = 3; // flag if same entity pair nets > N times
export const FREQUENCY_WINDOW_HOURS = 168; // rolling 7 days
