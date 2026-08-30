import type { Entity, Expense, Invoice } from "../types";

// Sample crew: SG, TH, US, DE. Everyone has a domestic rail.

export const SEED_ENTITIES: Entity[] = [
  {
    id: "ent-alice",
    name: "Alice Tan",
    country: "SG",
    contact: { type: "phone", value: "+65-9000-1111" },
    linkedRailAliases: [{ railType: "PayNow", alias: "+6590001111" }],
  },
  {
    id: "ent-bob",
    name: "Bob Sukhum",
    country: "TH",
    contact: { type: "phone", value: "+66-81-234-5678" },
    linkedRailAliases: [{ railType: "PromptPay", alias: "+66812345678" }],
  },
  {
    id: "ent-charlie",
    name: "Charlie Reed",
    country: "US",
    contact: { type: "email", value: "charlie@email.com" },
    linkedRailAliases: [{ railType: "Zelle", alias: "charlie@email.com" }],
  },
  {
    id: "ent-diana",
    name: "Diana Weber",
    country: "DE",
    contact: { type: "email", value: "diana@email.de" },
    linkedRailAliases: [
      { railType: "SEPA Instant", alias: "DE89370400440532013000" },
    ],
  },
  {
    id: "ent-eve",
    name: "Eve Lim",
    country: "SG",
    contact: { type: "phone", value: "+65-8000-9999" },
    linkedRailAliases: [{ railType: "PayNow", alias: "+6580009999" }],
  },
  {
    id: "ent-frank",
    name: "Frank Chaem",
    country: "TH",
    contact: { type: "phone", value: "+66-81-555-0000" },
    linkedRailAliases: [{ railType: "PromptPay", alias: "+66815550000" }],
  },
];

// Bangkok Trip 2026. After netting (USD):
//   Alice −217.30, Bob −243.80, Diana −360.30
//   Charlie +473.50, Eve +41.70, Frank +306.20
// Typical rails: TH→TH PromptPay, SG→TH PayNow↔PromptPay, SG→SG PayNow, else USDC.

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
    description: "Hotel, 3 nights in Bangkok",
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
