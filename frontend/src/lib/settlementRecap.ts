import type { Entity, Expense, NetObligation, NettingResult } from "../api/client";

import { railSummary } from "./paymentSlip";

export function tripSnapshot(
  entities: Entity[],
  expenses: Expense[],
): {
  travelerCount: number;
  expenseCount: number;
  countries: string[];
  currencies: string[];
} {
  const countries = [...new Set(entities.map((e) => e.country))];
  const currencies = [...new Set(expenses.map((e) => e.currency))];
  return {
    travelerCount: entities.length,
    expenseCount: expenses.length,
    countries,
    currencies,
  };
}

export function railMix(
  obligations: NetObligation[],
): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const o of obligations) {
    const name = railSummary(o).name;
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function totalFeesUsd(obligations: NetObligation[]): number {
  return (
    Math.round(obligations.reduce((s, o) => s + (o.feeUsd ?? 0), 0) * 100) / 100
  );
}

export function settleProgress(obligations: NetObligation[]): {
  total: number;
  settled: number;
  remaining: number;
  pct: number;
} {
  const total = obligations.length;
  const settled = obligations.filter((o) => o.status === "settled").length;
  return {
    total,
    settled,
    remaining: total - settled,
    pct: total ? Math.round((settled / total) * 100) : 0,
  };
}

/** Cheapest chosen rail vs the most expensive eligible alternative. */
export function vsCostliest(
  obligation: NetObligation,
): { name: string; savingsUsd: number } | null {
  const rows = (obligation.considered ?? []).filter((c) => c.eligible !== false);
  const chosen = rows.find((c) => c.chosen);
  if (!chosen || rows.length < 2) return null;
  let worst = chosen;
  for (const c of rows) {
    if (c.feeEstimatePct > worst.feeEstimatePct) worst = c;
  }
  if (
    worst.railName === chosen.railName &&
    worst.feeEstimatePct === chosen.feeEstimatePct
  ) {
    return null;
  }
  const savingsUsd =
    Math.round(
      obligation.amountUsd *
        ((worst.feeEstimatePct - chosen.feeEstimatePct) / 100) *
        100,
    ) / 100;
  if (savingsUsd < 0.01) return null;
  return { name: worst.railName, savingsUsd };
}

export function recapText(input: {
  tripName: string;
  netting?: Pick<
    NettingResult,
    | "rawEdgeCount"
    | "netEdgeCount"
    | "feeSavingsUsd"
    | "corridorSavingsUsd"
    | "greedyFeeUsd"
  > | null;
  obligations: NetObligation[];
  entityOf: (id: string) => Entity | undefined;
}): string {
  const lines: string[] = [`LiteFX · ${input.tripName}`];
  if (input.netting) {
    lines.push(
      `${input.netting.rawEdgeCount} IOUs became ${input.netting.netEdgeCount} transfers. Agent picked cheapest corridors. Est. fees saved $${input.netting.feeSavingsUsd.toFixed(2)} vs paying each IOU.`,
    );
    if ((input.netting.corridorSavingsUsd ?? 0) > 0) {
      const greedy =
        (input.netting.greedyFeeUsd ?? 0) > 0
          ? ` (about $${input.netting.greedyFeeUsd!.toFixed(2)} in fees)`
          : "";
      lines.push(
        `Cheapest-corridor matching saved $${input.netting.corridorSavingsUsd!.toFixed(2)} vs a largest-first match${greedy}.`,
      );
    }
  }
  const mix = railMix(input.obligations);
  if (mix.length) {
    lines.push(
      `Rails: ${mix
        .map((m) => (m.count > 1 ? `${m.name} ×${m.count}` : m.name))
        .join(", ")}.`,
    );
  }
  if (input.obligations.length) {
    lines.push("");
    for (const o of input.obligations) {
      const from = input.entityOf(o.from)?.name.trim() ?? o.from;
      const to = input.entityOf(o.to)?.name.trim() ?? o.to;
      const pick = railSummary(o);
      lines.push(
        `${from} → ${to}  $${o.amountUsd.toFixed(2)}  ${pick.name} (${o.status})`,
      );
    }
  }
  return lines.join("\n");
}

export function splitSummary(
  participantIds: string[],
  entities: { id: string; name: string }[],
): string {
  const names = participantIds
    .map(
      (id) =>
        entities.find((e) => e.id === id)?.name.trim().split(/\s+/)[0] ?? "",
    )
    .filter(Boolean);
  if (names.length === 0) return "";
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}
