import { cheapestRail } from "../data/railOptions.js";
import { primaryRail, hasUsableAccount } from "../data/countries.js";
import { getStore } from "../store.js";

export interface SettlementInsight {
  type: "link_account";
  recipientId: string;
  recipientName: string;
  country: string;
  suggestedRail: string;
  currentFeeUsd: number;
  linkedFeeUsd: number;
  savingsUsd: number;
  wouldBeRail: string;
  wouldBeRailName: string;
  message: string;
}

export interface SettlementPlan {
  text: string;
  insights: SettlementInsight[];
}

/** Human-readable who-pays-whom plan plus "link an account" tips. */
export function buildSettlementPlan(): SettlementPlan {
  const st = getStore();
  const nameOf = (id: string) =>
    st.entities.find((e) => e.id === id)?.name.trim() || id;

  const lines: string[] = [`LiteFX settlement plan · ${st.name}`];
  if (st.nettingSummary) {
    lines.push(
      `${st.nettingSummary.netEdgeCount} transfers (from ${st.nettingSummary.rawEdgeCount} pairwise debts)`,
    );
    lines.push(
      `Est. fees saved: $${st.nettingSummary.feeSavingsUsd.toFixed(2)}`,
    );
  }
  lines.push("");

  if (st.netObligations.length === 0) {
    lines.push("No netted transfers yet. Run Net & route first.");
  } else {
    for (const ob of st.netObligations) {
      const rail = obligationRailName(ob);
      const claim = ob.claimToken ? `  /claim/${ob.claimToken}` : "";
      lines.push(
        `${nameOf(ob.from)} → ${nameOf(ob.to)}  $${ob.amountUsd.toFixed(2)}  ${rail} (${ob.status})${claim}`,
      );
    }
  }

  const insights = buildInsights();
  if (insights.length) {
    lines.push("");
    lines.push("Tips");
    for (const tip of insights) lines.push(`• ${tip.message}`);
  }

  return { text: lines.join("\n"), insights };
}

function obligationRailName(ob: {
  chosenRail?: string;
  considered?: { chosen?: boolean; railName: string }[];
}): string {
  const chosen = ob.considered?.find((c) => c.chosen);
  if (chosen?.railName) return chosen.railName;
  if (ob.chosenRail === "claim_link") return "claim link";
  if (ob.chosenRail === "stable_bridge") return "USDC Bridge (Circle)";
  return ob.chosenRail ?? "unrouted";
}

function buildInsights(): SettlementInsight[] {
  const st = getStore();
  const totals = new Map<
    string,
    { amountUsd: number; pick: ReturnType<typeof cheapestRail> }
  >();

  for (const ob of st.netObligations) {
    if (ob.chosenRail !== "claim_link") continue;
    const to = st.entities.find((e) => e.id === ob.to);
    const from = st.entities.find((e) => e.id === ob.from);
    if (!to || !from || hasUsableAccount(to.country, to.linkedRailAliases))
      continue;
    const pick = cheapestRail(from.country, to.country, true);
    const prev = totals.get(to.id);
    if (!prev) {
      totals.set(to.id, { amountUsd: ob.amountUsd, pick });
    } else {
      prev.amountUsd += ob.amountUsd;
      if (pick.feeEstimatePct < prev.pick.feeEstimatePct) prev.pick = pick;
    }
  }

  const out: SettlementInsight[] = [];
  for (const [recipientId, { amountUsd, pick: linked }] of totals) {
    const to = st.entities.find((e) => e.id === recipientId);
    if (!to) continue;
    const currentFeeUsd = round2(amountUsd * 0.01);
    const linkedFeeUsd = round2(amountUsd * (linked.feeEstimatePct / 100));
    const savingsUsd = round2(currentFeeUsd - linkedFeeUsd);
    const suggestedRail = primaryRail(to.country);
    const name = to.name.trim();
    const usesDomesticCorridor =
      linked.type === "local" || linked.type === "linked";
    out.push({
      type: "link_account",
      recipientId: to.id,
      recipientName: name,
      country: to.country,
      suggestedRail,
      currentFeeUsd,
      linkedFeeUsd,
      savingsUsd,
      wouldBeRail: linked.type,
      wouldBeRailName: linked.railName,
      message: usesDomesticCorridor
        ? savingsUsd > 0
          ? `If ${name} linked ${suggestedRail}, this payout would use ${linked.railName} (~${linked.feeEstimatePct}%) instead of a claim link (1%). About $${savingsUsd.toFixed(2)} less in fees.`
          : `If ${name} linked ${suggestedRail}, they could be paid on ${linked.railName} instead of a claim link.`
        : `If ${name} linked a ${suggestedRail} account, this would settle over ${linked.railName} instead of a claim link. The sender would not pay via ${suggestedRail}.`,
    });
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
