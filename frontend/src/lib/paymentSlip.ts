import type { Entity, NetObligation } from "../api/client";

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
  const rail = to.linkedRailAliases[0]?.railType;
  const payer = from.name.trim();
  const payee = to.name.trim();

  if (obligation.chosenRail === "claim_link") {
    return {
      label: "Claim link",
      text: `${payer} shares a claim link. ${payee} picks how to receive ${amount}. Ref ${ref}.`,
    };
  }
  if (obligation.chosenRail === "stable_bridge") {
    return {
      label: "USDC send",
      text: `${payer} sends $${obligation.amountUsd.toFixed(2)} USDC to ${payee} (sandbox wallet 0xLITEFX…${to.id.slice(-4)}). Ref ${ref}.`,
    };
  }
  return {
    label: rail || "Local send",
    text: `${payer} sends ${amount} via ${rail || "the local rail"} to ${alias}. Reference ${ref}.`,
  };
}
