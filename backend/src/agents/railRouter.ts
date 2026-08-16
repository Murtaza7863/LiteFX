import type { NetObligation, RailType, RailConsideration } from "../types";
import { getEntity, getStore, updateNetObligation } from "../store";
import { cheapestRail, corridorOptions } from "../data/railOptions";
import { evaluateCompliance } from "./compliance";

// ──────────────────────────────────────────────
// Agent 2 — Rail router agent
//
// For each net obligation, pick the cheapest rail
// the recipient can actually use, and explain why.
//
// Eligible set:
//   - no linked account → claim_link only
//   - otherwise every corridor option (local / SEPA,
//     linked bilateral, USDC fallback)
// Pick lowest fee, then fastest.
// ──────────────────────────────────────────────

export interface RoutingDecision {
  obligationId: string;
  rail: RailType;
  railName: string;
  feeEstimatePct: number;
  timeEstimateHours: number;
  reason: string;
}

export function routeObligation(ob: NetObligation): RoutingDecision | null {
  const sender = getEntity(ob.from);
  const recipient = getEntity(ob.to);
  if (!sender || !recipient) return null;
  const hasAccount = recipient.linkedRailAliases.length > 0;
  const pick = cheapestRail(sender.country, recipient.country, hasAccount);

  let reason: string;
  if (pick.type === "claim_link") {
    reason = `Recipient "${recipient.name.trim()}" has no linked account — claim_link so they can choose a payout without signing up.`;
  } else {
    const alts = corridorOptions(sender.country, recipient.country).filter(
      (o) => o.railName !== pick.railName,
    );
    const altBit =
      alts.length > 0
        ? ` Next-best: ${alts
            .map((a) => `${a.railName} at ${a.feeEstimatePct}%`)
            .join("; ")}.`
        : "";
    reason = `Cheapest eligible rail for ${sender.country}→${recipient.country}: ${pick.railName} at ${pick.feeEstimatePct}% (~${pick.timeEstimateHours}h).${altBit}`;
  }

  return {
    obligationId: ob.id,
    rail: pick.type,
    railName: pick.railName,
    feeEstimatePct: pick.feeEstimatePct,
    timeEstimateHours: pick.timeEstimateHours,
    reason,
  };
}

export function runRouting(): NetObligation[] {
  const store = getStore();
  const obligations = store.netObligations;

  evaluateCompliance();

  for (const ob of obligations) {
    if (ob.status !== "pending") continue;
    const decision = routeObligation(ob);
    if (!decision) continue;
    const sender = getEntity(ob.from);
    const recipient = getEntity(ob.to);
    if (!sender || !recipient) continue;
    updateNetObligation(ob.id, {
      chosenRail: decision.rail,
      routingReason: decision.reason,
      considered: buildConsidered(
        sender,
        recipient,
        decision.rail,
        decision.railName,
      ),
      feeUsd: Math.round(ob.amountUsd * decision.feeEstimatePct) / 100,
      timeHours: decision.timeEstimateHours,
      status: "routed",
    });
  }

  return getStore().netObligations;
}

function buildConsidered(
  sender: { country: string },
  recipient: { country: string; linkedRailAliases: unknown[] },
  chosen: RailType,
  chosenName: string,
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
    const isChosen = o.railName === chosenName;
    list.push({
      type: o.type,
      railName: o.railName,
      feeEstimatePct: o.feeEstimatePct,
      timeEstimateHours: o.timeEstimateHours,
      chosen: isChosen,
      note: !hasAccount
        ? "Ineligible — recipient has no account on this rail."
        : isChosen
          ? "Cheapest eligible option."
          : `Evaluated: ${o.feeEstimatePct}% fee / ${o.timeEstimateHours}h — not cheapest.`,
    });
  }
  return list;
}

export function getRailTypesExercised(): RailType[] {
  const store = getStore();
  const types = new Set<RailType>();
  for (const ob of store.netObligations) {
    if (ob.chosenRail) types.add(ob.chosenRail);
  }
  return Array.from(types);
}
