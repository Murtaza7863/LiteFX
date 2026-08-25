import type { Entity, NetObligation } from "../api/client";
import {
  LINKED_CORRIDORS,
  canonicalizeRail,
  linkedKey,
  sharedLocalRail,
} from "../../../backend/src/data/countries";

function corridorRailName(
  type: NetObligation["chosenRail"],
  from: Entity,
  to: Entity,
): string | undefined {
  if (type === "local") {
    if (from.country === to.country) {
      return (
        canonicalizeRail(to.country, to.linkedRailAliases[0]?.railType) ??
        sharedLocalRail(from.country, to.country)
      );
    }
    return sharedLocalRail(from.country, to.country);
  }
  if (type === "linked")
    return LINKED_CORRIDORS[linkedKey(from.country, to.country)];
  if (type === "stable_bridge") return "USDC Bridge (Circle)";
  return undefined;
}

export function railSummary(obligation: NetObligation): {
  name: string;
  feePct: number | null;
  feeUsd: number;
} {
  const chosen = obligation.considered?.find((c) => c.chosen);
  if (chosen) {
    return {
      name: chosen.railName,
      feePct: chosen.feeEstimatePct,
      feeUsd: obligation.feeUsd ?? 0,
    };
  }
  if (obligation.chosenRail === "claim_link") {
    return { name: "Claim link", feePct: 1, feeUsd: obligation.feeUsd ?? 0 };
  }
  if (obligation.chosenRail === "stable_bridge") {
    return {
      name: "USDC Bridge (Circle)",
      feePct: 1.5,
      feeUsd: obligation.feeUsd ?? 0,
    };
  }
  return {
    name: obligation.chosenRail ?? "Unrouted",
    feePct: null,
    feeUsd: obligation.feeUsd ?? 0,
  };
}

export function allSendSlips(
  obligations: NetObligation[],
  entityOf: (id: string) => Entity | undefined,
): string {
  return obligations
    .map((o) => {
      const from = entityOf(o.from);
      const to = entityOf(o.to);
      if (!from || !to) return null;
      return paymentSlip(o, from, to).text;
    })
    .filter((line): line is string => !!line)
    .join("\n\n");
}

export function paymentSlip(
  obligation: NetObligation,
  from: Entity,
  to: Entity,
): { label: string; text: string } {
  const amount = `${obligation.amount.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })} ${obligation.settlementCurrency}`;
  const ref = `LiteFX ${obligation.id}`;
  const alias =
    to.linkedRailAliases[0]?.alias || to.contact.value || to.name.trim();
  const payer = from.name.trim();
  const payee = to.name.trim();

  if (obligation.chosenRail === "claim_link") {
    return {
      label: "Claim link",
      text: `${payer} (${from.country}) shares a claim link. ${payee} (${to.country}) picks a local payout for ${amount} ($${obligation.amountUsd.toFixed(2)}). The sender does not use ${payee}'s domestic rail. Ref ${ref}.`,
    };
  }

  const railName = corridorRailName(obligation.chosenRail, from, to);
  if (
    obligation.chosenRail === "stable_bridge" ||
    (obligation.chosenRail && !railName)
  ) {
    return {
      label: "USDC send",
      text: `${payer} (${from.country}) sends $${obligation.amountUsd.toFixed(2)} USDC to ${payee} (${to.country}) (sandbox wallet 0xLITEFX…${to.id.slice(-4)}). Ref ${ref}.`,
    };
  }

  return {
    label: railName || "Local send",
    text: `${payer} (${from.country}) sends ${amount} ($${obligation.amountUsd.toFixed(2)}) via ${railName || "the local rail"} to ${alias} (${to.country}). Reference ${ref}.`,
  };
}
