import type { Entity, Expense, Invoice } from "../types";

// ──────────────────────────────────────────────
// Seeded scenario: 5 travelers across Singapore,
// Thailand, the US, and Germany (Eurozone), plus
// one extra traveler in Thailand.
// Eve (SG) has NO linkedRailAliases — she forces a
// claim_link flow.
// ──────────────────────────────────────────────

export const SEED_ENTITIES: Entity[] = [
  {
    id: "ent-alice",
    name: "Alice Tan",
    country: "SG",
    contact: { type: "phone", value: "+65-9000-1111" },
    linkedRailAliases: [{ railType: "paynow", alias: "+6590001111" }],
  },
  {
    id: "ent-bob",
    name: "Bob Sukhum",
    country: "TH",
    contact: { type: "phone", value: "+66-81-234-5678" },
    linkedRailAliases: [{ railType: "promptpay", alias: "+66812345678" }],
  },
  {
    id: "ent-charlie",
    name: "Charlie Reed",
    country: "US",
    contact: { type: "email", value: "charlie@email.com" },
    linkedRailAliases: [{ railType: "zelle", alias: "charlie@email.com" }],
  },
  {
    id: "ent-diana",
    name: "Diana Weber",
    country: "DE",
    contact: { type: "email", value: "diana@email.de" },
    linkedRailAliases: [{ railType: "sepa", alias: "DE89370400440532013000" }],
  },
  {
    id: "ent-eve",
    name: "Eve Lim",
    country: "SG",
    contact: { type: "phone", value: "+65-8000-9999" },
    linkedRailAliases: [], // ← no account anywhere → forces claim_link
  },
  {
    id: "ent-frank",
    name: "Frank Chaem",
    country: "TH",
    contact: { type: "phone", value: "+66-81-555-0000" },
    linkedRailAliases: [{ railType: "promptpay", alias: "+66815550000" }],
  },
];

// ──────────────────────────────────────────────
// Expenses for the "Bangkok Trip 2026".
// Each expense is split equally among all participants.
// Designed so that after netting, the resulting obligations
// exercise all four rail types (local, linked, claim_link,
// stable_bridge).
//
// Net balances (in USD, the reference currency):
//   Alice  (SG) :  -217.30  (debtor)
//   Bob    (TH) :  -243.80  (debtor)
//   Charlie(US) :  +473.50  (creditor)
//   Diana  (DE) :  -360.30  (debtor)
//   Eve    (SG) :   +41.70  (creditor, no account → claim_link)
//   Frank  (TH) :  +306.20  (creditor)
//
// Net obligations (5, corridor-aware matching):
//   1. Bob    → Frank   : local        (TH↔TH, 0%)
//   2. Alice  → Frank   : linked       (SG↔TH, 0.5%)
//   3. Alice  → Eve     : claim_link   (Eve has no account)
//   4. Diana  → Charlie : stable_bridge (DE↔US)
//   5. Alice  → Charlie : stable_bridge (SG↔US)
// ──────────────────────────────────────────────

export const SEED_EXPENSES: Expense[] = [
  {
    id: "exp-1",
    payerId: "ent-frank",
    participantIds: [
      "ent-alice",
      "ent-bob",
      "ent-charlie",
      "ent-diana",
      "ent-eve",
      "ent-frank",
    ],
    amount: 9000,
    currency: "THB",
    tripId: "trip-bkk-2026",
    category: "accommodation",
    description: "Hotel — 3 nights in Bangkok",
  },
  {
    id: "exp-2",
    payerId: "ent-bob",
    participantIds: ["ent-alice", "ent-bob", "ent-charlie", "ent-frank"],
    amount: 6000,
    currency: "THB",
    tripId: "trip-bkk-2026",
    category: "food",
    description: "Group dinner at Jay Fai",
  },
  {
    id: "exp-3",
    payerId: "ent-alice",
    participantIds: ["ent-alice", "ent-charlie", "ent-diana", "ent-eve"],
    amount: 300,
    currency: "SGD",
    tripId: "trip-bkk-2026",
    category: "food",
    description: "Drinks at sky bar (pre-trip meetup)",
  },
  {
    id: "exp-4",
    payerId: "ent-charlie",
    participantIds: ["ent-alice", "ent-bob", "ent-charlie", "ent-diana"],
    amount: 600,
    currency: "USD",
    tripId: "trip-bkk-2026",
    category: "transport",
    description: "Flights to Bangkok",
  },
  {
    id: "exp-5",
    payerId: "ent-frank",
    participantIds: ["ent-alice", "ent-bob", "ent-frank"],
    amount: 3000,
    currency: "THB",
    tripId: "trip-bkk-2026",
    category: "activities",
    description: "Island tour from Pattaya",
  },
  {
    id: "exp-6",
    payerId: "ent-charlie",
    participantIds: [
      "ent-alice",
      "ent-bob",
      "ent-charlie",
      "ent-diana",
      "ent-eve",
      "ent-frank",
    ],
    amount: 240,
    currency: "USD",
    tripId: "trip-bkk-2026",
    category: "transport",
    description: "Van rental for the week",
  },
  {
    id: "exp-7",
    payerId: "ent-eve",
    participantIds: [
      "ent-alice",
      "ent-bob",
      "ent-diana",
      "ent-eve",
      "ent-frank",
    ],
    amount: 8000,
    currency: "THB",
    tripId: "trip-bkk-2026",
    category: "activities",
    description: "Spa day for the group",
  },
  {
    id: "exp-8",
    payerId: "ent-frank",
    participantIds: ["ent-bob", "ent-diana", "ent-frank"],
    amount: 3000,
    currency: "THB",
    tripId: "trip-bkk-2026",
    category: "transport",
    description: "Airport taxis",
  },
  {
    id: "exp-9",
    payerId: "ent-frank",
    participantIds: ["ent-alice", "ent-bob", "ent-charlie", "ent-frank"],
    amount: 200,
    currency: "SGD",
    tripId: "trip-bkk-2026",
    category: "food",
    description: "Rooftop cocktails",
  },
];

// ──────────────────────────────────────────────
// B2B invoices for the reconciliation view.
// ──────────────────────────────────────────────

export const SEED_INVOICES: Invoice[] = [
  {
    id: "inv-1",
    vendorId: "ent-frank",
    vendorName: "Frank Chaem",
    amount: 306.2,
    currency: "USD",
    bookingRef: "HOTEL-BKK-001",
    status: "open",
  },
  {
    id: "inv-2",
    vendorId: "ent-charlie",
    vendorName: "Charlie Reed",
    amount: 400,
    currency: "USD",
    bookingRef: "FLT-BKK-2026",
    status: "open",
  },
  {
    id: "inv-3",
    vendorId: "ent-eve",
    vendorName: "Eve Lim",
    amount: 41.7,
    currency: "USD",
    bookingRef: "SPA-BKK-001",
    status: "open",
  },
];
