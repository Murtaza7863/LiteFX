import type {
  Entity,
  NetObligation,
  RailConsideration,
  RailType,
} from "../types";
import {
  getEntity,
  getNetObligation,
  getStore,
  rememberTraveler,
  updateClaimLink,
  updateEntity,
  updateNetObligation,
} from "../store";
import {
  CLAIM_LINK_PICK,
  cheapestRail,
  corridorOptions,
  type RailPick,
} from "../data/railOptions";
import { primaryRail, hasUsableAccount } from "../data/countries";
import { runNetting } from "./netting";
import { evaluateCompliance } from "./compliance";

// ──────────────────────────────────────────────
// Agent 2 — Rail router agent
//
// For each net obligation, pick the cheapest rail
// the recipient can actually use, and explain why.
// Judges can override that pick or link an account
// to unlock cheaper rails — both re-route without
// wiping the netted graph.
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
  const hasAccount = hasUsableAccount(
    recipient.country,
    recipient.linkedRailAliases,
  );
  const pick = cheapestRail(sender.country, recipient.country, hasAccount);

  let reason: string;
  if (pick.type === "claim_link") {
    reason = `Recipient "${recipient.name.trim()}" has no linked account. Claim link so they can choose a payout without signing up.`;
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

function applyPick(
  ob: NetObligation,
  sender: Entity,
  recipient: Entity,
  pick: RailPick,
  reason: string,
): void {
  if (pick.type !== "claim_link") dropPendingClaims(ob.id);
  updateNetObligation(ob.id, {
    chosenRail: pick.type,
    routingReason: reason,
    considered: buildConsidered(sender, recipient, pick.type, pick.railName),
    feeUsd: Math.round(ob.amountUsd * pick.feeEstimatePct) / 100,
    timeHours: pick.timeEstimateHours,
    status: "routed",
  });
}

function dropPendingClaims(obligationId: string): void {
  const st = getStore();
  for (const c of st.claimLinks) {
    if (c.obligationId === obligationId && c.status === "pending") {
      updateClaimLink(c.token, { status: "expired" });
    }
  }
  const current = getNetObligation(obligationId);
  if (current && "claimToken" in current) {
    delete current.claimToken;
    updateNetObligation(obligationId, {});
  }
}

export function runRouting(): NetObligation[] {
  evaluateCompliance();
  for (const ob of getStore().netObligations) {
    if (ob.status !== "pending") continue;
    const decision = routeObligation(ob);
    if (!decision) continue;
    const sender = getEntity(ob.from);
    const recipient = getEntity(ob.to);
    if (!sender || !recipient) continue;
    applyPick(
      ob,
      sender,
      recipient,
      {
        type: decision.rail,
        railName: decision.railName,
        feeEstimatePct: decision.feeEstimatePct,
        timeEstimateHours: decision.timeEstimateHours,
      },
      decision.reason,
    );
  }
  return getStore().netObligations;
}

/** Re-run routing on unsettled transfers (e.g. after linking an account). */
export function rerouteUnsettled(filter?: { to?: string }): NetObligation[] {
  evaluateCompliance();
  for (const ob of getStore().netObligations) {
    if (ob.status === "settled") continue;
    if (filter?.to && ob.to !== filter.to) continue;
    const decision = routeObligation(ob);
    if (!decision) continue;
    const sender = getEntity(ob.from);
    const recipient = getEntity(ob.to);
    if (!sender || !recipient) continue;
    applyPick(
      ob,
      sender,
      recipient,
      {
        type: decision.rail,
        railName: decision.railName,
        feeEstimatePct: decision.feeEstimatePct,
        timeEstimateHours: decision.timeEstimateHours,
      },
      decision.reason,
    );
  }
  return getStore().netObligations;
}

export function overrideRail(
  obligationId: string,
  railName: string,
): NetObligation {
  const ob = getNetObligation(obligationId);
  if (!ob) throw new Error("Transfer not found.");
  if (ob.status === "settled") {
    throw new Error("This transfer is already settled.");
  }
  const sender = getEntity(ob.from);
  const recipient = getEntity(ob.to);
  if (!sender || !recipient) throw new Error("Traveler missing.");

  const considered = buildConsidered(
    sender,
    recipient,
    ob.chosenRail ?? "claim_link",
    ob.considered?.find((c) => c.chosen)?.railName ?? "",
  );
  const row = considered.find(
    (c) => c.railName === railName || c.type === railName,
  );
  if (!row) throw new Error("That rail is not available on this corridor.");
  if (!row.eligible) {
    throw new Error(
      `Recipient has no linked account. Link ${primaryRail(recipient.country)} first, or keep the claim link.`,
    );
  }

  const pick: RailPick = {
    type: row.type,
    railName: row.railName,
    feeEstimatePct: row.feeEstimatePct,
    timeEstimateHours: row.timeEstimateHours,
  };
  const cheapest = cheapestRail(
    sender.country,
    recipient.country,
    hasUsableAccount(recipient.country, recipient.linkedRailAliases),
  );
  const reason =
    pick.railName === cheapest.railName
      ? `Cheapest eligible rail for ${sender.country}→${recipient.country}: ${pick.railName} at ${pick.feeEstimatePct}%.`
      : `Manual override: ${pick.railName} at ${pick.feeEstimatePct}% (~${pick.timeEstimateHours}h) instead of ${cheapest.railName} at ${cheapest.feeEstimatePct}%.`;
  applyPick(ob, sender, recipient, pick, reason);
  const next = getNetObligation(obligationId);
  if (!next) throw new Error("Transfer not found.");
  return next;
}

/** Attach the country's primary rail so claim_link payouts can become local/linked. */
export function linkRecipientAccount(entityId: string): Entity {
  const ent = getEntity(entityId);
  if (!ent) throw new Error("Traveler not found.");
  if (!hasUsableAccount(ent.country, ent.linkedRailAliases)) {
    const rail = primaryRail(ent.country);
    const alias = ent.contact.value || ent.id;
    const updated = updateEntity(entityId, {
      linkedRailAliases: [{ railType: rail, alias }],
    });
    if (!updated) throw new Error("Traveler not found.");
  }
  rerouteUnsettled({ to: entityId });
  const latest = getEntity(entityId);
  if (!latest) throw new Error("Traveler not found.");
  return rememberTraveler(latest);
}

function buildConsidered(
  sender: { country: string },
  recipient: { country: string; linkedRailAliases: { railType: string }[] },
  chosen: RailType,
  chosenName: string,
): RailConsideration[] {
  const hasAccount = hasUsableAccount(
    recipient.country,
    recipient.linkedRailAliases,
  );
  const list: RailConsideration[] = [
    {
      type: "claim_link",
      railName: "Claim Link",
      feeEstimatePct: CLAIM_LINK_PICK.feeEstimatePct,
      timeEstimateHours: CLAIM_LINK_PICK.timeEstimateHours,
      chosen: chosen === "claim_link",
      eligible: true,
      note: hasAccount
        ? "Works without a linked account. Slower, and a 1% fee."
        : "Recipient has no linked account. The only way to pay them.",
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
      eligible: hasAccount,
      note: !hasAccount
        ? "Ineligible. Recipient has no account on this rail."
        : isChosen
          ? "Selected."
          : `${o.feeEstimatePct}% fee / ${o.timeEstimateHours}h.`,
    });
  }
  return list;
}

export function getRailTypesExercised(): RailType[] {
  const types = new Set<RailType>();
  for (const ob of getStore().netObligations) {
    if (ob.chosenRail) types.add(ob.chosenRail);
  }
  return Array.from(types);
}

/** Wipe and rebuild nets + rails. Used after a traveler's country changes. */
export function rebuildSettlement(): boolean {
  if (getStore().debtEdges.length === 0) return false;
  runNetting();
  runRouting();
  return true;
}

/**
 * If the trip has IOUs but no live plan, net everyone and pick the cheapest
 * rails. No-ops when already routed, so a description-only edit stays put.
 * Does not settle: ledger / claim links stay user-confirmed.
 */
export function ensureLiveSettlement(): boolean {
  if (getStore().debtEdges.length === 0) return false;
  if (getStore().netObligations.length > 0) return false;
  return rebuildSettlement();
}
