import type { RailOption } from "../types";

// ──────────────────────────────────────────────
// Mock rail-options table keyed by country pair.
// In production this would be fetched from a rail-routing
// service (e.g. Wise, Airwallex, or a proprietary routing layer).
// ──────────────────────────────────────────────

export const RAIL_OPTIONS: RailOption[] = [
  // ── Local instant rails (same-country) ──
  {
    type: "local",
    corridor: ["SG", "SG"],
    railName: "PayNow",
    feeEstimatePct: 0,
    timeEstimateHours: 0.5,
    requiresRecipientAccount: true,
  },
  {
    type: "local",
    corridor: ["TH", "TH"],
    railName: "PromptPay",
    feeEstimatePct: 0,
    timeEstimateHours: 0.5,
    requiresRecipientAccount: true,
  },
  {
    type: "local",
    corridor: ["US", "US"],
    railName: "Zelle",
    feeEstimatePct: 0,
    timeEstimateHours: 1,
    requiresRecipientAccount: true,
  },
  {
    type: "local",
    corridor: ["DE", "DE"],
    railName: "SEPA Instant",
    feeEstimatePct: 0,
    timeEstimateHours: 1,
    requiresRecipientAccount: true,
  },

  // ── Linked / bilateral instant-payment schemes ──
  // Modeled after the real PayNow–PromptPay linkage between SG and TH.
  {
    type: "linked",
    corridor: ["SG", "TH"],
    railName: "PayNow ↔ PromptPay Linkage",
    feeEstimatePct: 0.5,
    timeEstimateHours: 1,
    requiresRecipientAccount: true,
  },

  // ── Stablecoin bridge (fallback for corridors with no direct rail) ──
  // MOCKED — in production this would call the Circle / Stellar / USDC API.
  {
    type: "stable_bridge",
    corridor: ["US", "DE"],
    railName: "USDC Bridge (Circle)",
    feeEstimatePct: 1.5,
    timeEstimateHours: 24,
    requiresRecipientAccount: true,
  },
  {
    type: "stable_bridge",
    corridor: ["US", "TH"],
    railName: "USDC Bridge (Circle)",
    feeEstimatePct: 1.2,
    timeEstimateHours: 24,
    requiresRecipientAccount: true,
  },
  {
    type: "stable_bridge",
    corridor: ["DE", "TH"],
    railName: "USDC Bridge (Circle)",
    feeEstimatePct: 1.3,
    timeEstimateHours: 24,
    requiresRecipientAccount: true,
  },
  {
    type: "stable_bridge",
    corridor: ["SG", "US"],
    railName: "USDC Bridge (Circle)",
    feeEstimatePct: 1.5,
    timeEstimateHours: 24,
    requiresRecipientAccount: true,
  },
  {
    type: "stable_bridge",
    corridor: ["SG", "DE"],
    railName: "USDC Bridge (Circle)",
    feeEstimatePct: 1.4,
    timeEstimateHours: 24,
    requiresRecipientAccount: true,
  },
  {
    type: "stable_bridge",
    corridor: ["DE", "SG"],
    railName: "USDC Bridge (Circle)",
    feeEstimatePct: 1.4,
    timeEstimateHours: 24,
    requiresRecipientAccount: true,
  },
];

// Helper: find a rail by corridor and type (order-independent match).
export function findRail(
  countryA: string,
  countryB: string,
  type?: string
): RailOption | undefined {
  return RAIL_OPTIONS.find(
    (r) =>
      ((r.corridor[0] === countryA && r.corridor[1] === countryB) ||
        (r.corridor[0] === countryB && r.corridor[1] === countryA)) &&
      (type === undefined || r.type === type)
  );
}
