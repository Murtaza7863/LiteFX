import type { NetObligation, RailOption, RailType, RailConsideration } from "../types";
import { getEntity, getStore, updateNetObligation } from "../store";
import { bestRail, corridorOptions } from "../data/railOptions";
import { evaluateCompliance } from "./compliance";

// ──────────────────────────────────────────────
// Agent 2 — Rail router agent
//
// Assigns each NetObligation a settlement rail and
// explains *why* via the `routingReason` string, which
// is surfaced directly in the UI so the demo can show
// the decision, not just the outcome.
//
// Decision logic (evaluated in this order):
//   1. Recipient has no linkedRailAliases → claim_link
//      (regardless of what rail would otherwise apply —
//       they can't receive into an account they don't have).
//   2. Same country + local instant rail exists → local.
//   3. Linked/bilateral instant-payment scheme exists → linked.
//   4. Fallback → stable_bridge.
//
// Within valid options, prefer lower feeEstimatePct,
// tie-break on lower timeEstimateHours.
//
// NOTE: the spec lists claim_link as step 3, but the
// "regardless of what rail would otherwise apply" qualifier
// means it must be checked before local/linked — otherwise
// a recipient with no account in a linked corridor (e.g.
// SG↔TH) would be routed to "linked" even though they
// can't use it.  Checking claim_link first is the correct
// production behaviour.
// ──────────────────────────────────────────────

export interface RoutingDecision {
  obligationId: string;
  rail: RailType;
  railName: string;
  feeEstimatePct: number;
  timeEstimateHours: number;
  reason: string;
}

export function routeObligation(ob: NetObligation): RoutingDecision {
  const sender = getEntity(ob.from)!;
  const recipient = getEntity(ob.to)!;

  // ── Step 1: claim_link takes priority ──
  if (recipient.linkedRailAliases.length === 0) {
    const reason = `Recipient "${recipient.name.trim()}" has no linked account on file — claim_link generated so they can choose a payout method without signing up.`;
    return {
      obligationId: ob.id,
      rail: "claim_link",
      railName: "Claim Link (recipient chooses payout)",
      feeEstimatePct: 1.0,
      timeEstimateHours: 48,
      reason,
    };
  }

  // ── Step 2: same-country local rail ──
  if (sender.country === recipient.country) {
    const localRail = bestRail(sender.country, recipient.country, "local");
    if (localRail) {
      const reason = `Same-country instant rail (${localRail.railName}) available for ${sender.country}↔${recipient.country}, lowest fee option.`;
      return buildDecision(ob.id, localRail, reason);
    }
  }

  // ── Step 3: linked bilateral rail ──
  const linkedRail = bestRail(sender.country, recipient.country, "linked");
  if (linkedRail) {
    const reason = `Linked bilateral rail (${linkedRail.railName}) connects ${sender.country}↔${recipient.country}; both parties have accounts.`;
    return buildDecision(ob.id, linkedRail, reason);
  }

  // ── Step 4: fallback — stablecoin bridge ──
  const bridgeRail = bestRail(sender.country, recipient.country, "stable_bridge");
  if (bridgeRail) {
    const reason = `No direct local or linked rail for ${sender.country}↔${recipient.country}. Falling back to stablecoin bridge (${bridgeRail.railName}).`;
    return buildDecision(ob.id, bridgeRail, reason);
  }

  // Ultimate fallback if no rail option exists at all in the mock table.
  const reason = `No specific rail configured for ${sender.country}↔${recipient.country}. Using default stablecoin bridge.`;
  return {
    obligationId: ob.id,
    rail: "stable_bridge",
    railName: "USDC Bridge (default)",
    feeEstimatePct: 2.0,
    timeEstimateHours: 24,
    reason,
  };
}

function buildDecision(
  obligationId: string,
  rail: RailOption,
  reason: string
): RoutingDecision {
  return {
    obligationId,
    rail: rail.type,
    railName: rail.railName,
    feeEstimatePct: rail.feeEstimatePct,
    timeEstimateHours: rail.timeEstimateHours,
    reason,
  };
}

export function runRouting(): NetObligation[] {
  const store = getStore();
  const obligations = store.netObligations;

  // Evaluate compliance flags (for badges) without marking the compliance
  // step as run, so the stepper tick only appears when the user runs it.
  evaluateCompliance();

  for (const ob of obligations) {
    if (ob.status !== "pending") continue;
    const decision = routeObligation(ob);
    const sender = getEntity(ob.from)!;
    const recipient = getEntity(ob.to)!;
    updateNetObligation(ob.id, {
      chosenRail: decision.rail,
      routingReason: decision.reason,
      considered: buildConsidered(sender, recipient, decision.rail, decision.railName),
      feeUsd: Math.round(ob.amountUsd * decision.feeEstimatePct) / 100,
      timeHours: decision.timeEstimateHours,
      status: "routed",
    });
  }

  return getStore().netObligations;
}

// Build the list of rails the router evaluated for this corridor, so the
// UI can show the decision (chosen vs alternatives), not just the outcome.
function buildConsidered(
  sender: { country: string },
  recipient: { country: string; linkedRailAliases: unknown[] },
  chosen: RailType,
  chosenName: string
): RailConsideration[] {
  const hasAccount = recipient.linkedRailAliases.length > 0;
  const list: RailConsideration[] = [
    {
      type: "claim_link",
      railName: "Claim Link",
      feeEstimatePct: 1.0,
      timeEstimateHours: 48,
      chosen: chosen === "claim_link",
      note: hasAccount
        ? "Recipient has a linked account, so a claim link isn't needed."
        : "Recipient has no linked account — the only way to pay them.",
    },
  ];
  const corridor = corridorOptions(sender.country, recipient.country);
  for (const o of corridor) {
    list.push({
      type: o.type,
      railName: o.railName,
      feeEstimatePct: o.feeEstimatePct,
      timeEstimateHours: o.timeEstimateHours,
      chosen: o.railName === chosenName,
      note: o.railName === chosenName ? "Chosen by the router." : "Evaluated but not chosen.",
    });
  }
  return list;
}

// Helper for the UI / tests
export function getRailTypesExercised(): RailType[] {
  const store = getStore();
  const types = new Set<RailType>();
  for (const ob of store.netObligations) {
    if (ob.chosenRail) types.add(ob.chosenRail);
  }
  return Array.from(types);
}
