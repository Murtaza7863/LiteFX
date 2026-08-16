import type { DebtEdge, Entity, Expense, NetObligation } from "../api/client";

export function toUsd(
  amount: number,
  currency: string,
  rates?: Record<string, number>,
): number | null {
  if (currency === "USD") return Math.round(amount * 10000) / 10000;
  const rate = rates?.[currency];
  if (rate == null || !Number.isFinite(rate)) return null;
  return Math.round(amount * rate * 10000) / 10000;
}

export function formatUsd(n: number, signed = false): string {
  const abs = Math.abs(n).toFixed(2);
  if (!signed || Math.abs(n) < 0.005) return `$${abs}`;
  return `${n > 0 ? "+" : "−"}$${abs}`;
}

export function runningBalances(
  entities: Entity[],
  debtEdges: DebtEdge[],
): { entityId: string; entityName: string; netUsd: number }[] {
  const map = new Map(entities.map((e) => [e.id, 0]));
  for (const d of debtEdges) {
    if (!map.has(d.from) || !map.has(d.to)) continue;
    map.set(d.from, (map.get(d.from) ?? 0) - d.amountUsd);
    map.set(d.to, (map.get(d.to) ?? 0) + d.amountUsd);
  }
  return entities
    .map((e) => ({
      entityId: e.id,
      entityName: e.name.trim(),
      netUsd: Math.round((map.get(e.id) ?? 0) * 100) / 100,
    }))
    .sort((a, b) => b.netUsd - a.netUsd);
}

export function remainingFromObligations(
  entities: Entity[],
  obligations: NetObligation[],
): Map<string, { payUsd: number; receiveUsd: number }> {
  const map = new Map(
    entities.map((e) => [e.id, { payUsd: 0, receiveUsd: 0 }]),
  );
  for (const o of obligations) {
    if (o.status === "settled") continue;
    const from = map.get(o.from);
    const to = map.get(o.to);
    if (from) from.payUsd += o.amountUsd;
    if (to) to.receiveUsd += o.amountUsd;
  }
  return map;
}

/** After netting, show what is still open. Before netting, use IOU nets. */
export function bookPositionUsd(
  netUsd: number,
  remaining: { payUsd: number; receiveUsd: number } | undefined,
  netted: boolean,
): number {
  if (!netted) return netUsd;
  return (
    Math.round(
      ((remaining?.receiveUsd ?? 0) - (remaining?.payUsd ?? 0)) * 100,
    ) / 100
  );
}

export function spendByPerson(
  entities: Entity[],
  expenses: Expense[],
  rates?: Record<string, number>,
): { entityId: string; entityName: string; paidUsd: number }[] {
  const map = new Map(entities.map((e) => [e.id, 0]));
  for (const exp of expenses) {
    const usd = toUsd(exp.amount, exp.currency, rates);
    if (usd == null) continue;
    map.set(exp.payerId, (map.get(exp.payerId) ?? 0) + usd);
  }
  return entities
    .map((e) => ({
      entityId: e.id,
      entityName: e.name.trim(),
      paidUsd: Math.round((map.get(e.id) ?? 0) * 100) / 100,
    }))
    .sort((a, b) => b.paidUsd - a.paidUsd);
}

export function spendByCategory(
  expenses: Expense[],
  rates?: Record<string, number>,
): { category: string; usd: number }[] {
  const map = new Map<string, number>();
  for (const exp of expenses) {
    const usd = toUsd(exp.amount, exp.currency, rates);
    if (usd == null) continue;
    map.set(exp.category, (map.get(exp.category) ?? 0) + usd);
  }
  return [...map.entries()]
    .map(([category, usd]) => ({
      category,
      usd: Math.round(usd * 100) / 100,
    }))
    .sort((a, b) => b.usd - a.usd);
}

export function previewShares(input: {
  amount: number;
  payerId: string;
  participantIds: string[];
  mode: "equal" | "percent" | "amount";
  parts: Record<string, number>;
}): Record<string, number> {
  const { amount, payerId, participantIds, mode, parts } = input;
  const shares: Record<string, number> = {};
  if (mode === "percent") {
    let assigned = 0;
    for (const pid of participantIds) {
      const pct = parts[pid] ?? 0;
      shares[pid] = (amount * pct) / 100;
      assigned += pct;
    }
    const remainderPct = 100 - assigned;
    if (remainderPct > 0) {
      shares[payerId] = (shares[payerId] ?? 0) + (amount * remainderPct) / 100;
    }
  } else if (mode === "amount") {
    let assigned = 0;
    for (const pid of participantIds) {
      const amt = parts[pid] ?? 0;
      shares[pid] = amt;
      assigned += amt;
    }
    const remainder = amount - assigned;
    if (remainder > 0) {
      shares[payerId] = (shares[payerId] ?? 0) + remainder;
    }
  } else {
    const ids = participantIds;
    const count = ids.length || 1;
    const cents = Math.round(amount * 100);
    const base = Math.floor(cents / count);
    const extra = cents - base * count;
    const remainderTo = ids.includes(payerId) ? payerId : ids[count - 1];
    for (const pid of ids) {
      shares[pid] = (base + (pid === remainderTo ? extra : 0)) / 100;
    }
  }
  return shares;
}

export function booksCloseUsd(
  balances: { netUsd: number }[],
  epsilon = 0.05,
): { sum: number; closed: boolean } {
  const sum =
    Math.round(balances.reduce((s, b) => s + b.netUsd, 0) * 100) / 100;
  return { sum, closed: Math.abs(sum) < epsilon };
}
