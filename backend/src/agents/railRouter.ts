import type { NetObligation, RailOption, RailType } from "../types";
import { getEntity, getStore, updateNetObligation } from "../store";
import { RAIL_OPTIONS } from "../data/railOptions";
import { runCompliance } from "./compliance";

// Among the rails of a given type on a corridor, prefer the lowest
// feeEstimatePct, tie-breaking on lower timeEstimateHours.
function bestRail(a: string, b: string, type: RailType): RailOption | undefined {
  return RAIL_OPTIONS.filter(
    (r) =>
      r.type === type &&
      ((r.corridor[0] === a && r.corridor[1] === b) ||
        (r.corridor[0] === b && r.corridor[1] === a))
  ).sort(
    (x, y) => x.feeEstimatePct - y.feeEstimatePct || x.timeEstimateHours - y.timeEstimateHours
  )[0];
}

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

  // Run the compliance stub *before* marking obligations routed, so any
  // flags are attached and surfaced alongside the routing decision.
  runCompliance();

  for (const ob of obligations) {
    if (ob.status !== "pending") continue;
    const decision = routeObligation(ob);
    updateNetObligation(ob.id, {
      chosenRail: decision.rail,
      routingReason: decision.reason,
      status: "routed",
    });
  }

  return getStore().netObligations;
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
