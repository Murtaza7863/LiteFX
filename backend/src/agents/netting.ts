import type { DebtEdge, Entity, NetObligation } from "../types";
import { currencyOf, fromUsd, toUsd } from "../types";
import { getStore, setNetObligations, setNettingSummary } from "../store";
import { bestRail } from "../data/railOptions";

// ──────────────────────────────────────────────
// Agent 1 — Netting agent
//
// Turns many pairwise, multi-currency debts into the
// fewest possible net transfers using a greedy
// "largest-debtor → largest-creditor" approach
// (the same algorithm Splitwise uses for "simplify debts").
//
// Not globally optimal in every edge case, but fast,
// well-understood, and a good approximation. Don't
// over-engineer into a full min-cost-flow solver for
// the hackathon.
// ──────────────────────────────────────────────

const EPSILON = 0.005; // half a cent — anything below this is "zero"

/** Find connected components in the debt graph using BFS. */
function findConnectedComponents(
  entityIds: string[],
  edges: DebtEdge[]
): string[][] {
  const adj = new Map<string, Set<string>>();
  for (const id of entityIds) adj.set(id, new Set());
  for (const e of edges) {
    adj.get(e.from)?.add(e.to);
    adj.get(e.to)?.add(e.from);
  }

  const visited = new Set<string>();
  const components: string[][] = [];

  for (const id of entityIds) {
    if (visited.has(id)) continue;
    const comp: string[] = [];
    const queue = [id];
    visited.add(id);
    while (queue.length) {
      const cur = queue.shift()!;
      comp.push(cur);
      for (const nb of adj.get(cur) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push(nb);
        }
      }
    }
    components.push(comp);
  }
  return components;
}

export interface NettingResult {
  obligations: NetObligation[];
  rawEdgeCount: number;
  netEdgeCount: number;
  reductionRatio: number;
  balances: { entityId: string; entityName: string; netUsd: number }[];
}

export function runNetting(): NettingResult {
  const store = getStore();
  const entities = store.entities;
  const debtEdges = store.debtEdges;

  // Step 1 — all edges already carry amountUsd (converted at store-creation time).
  // Group by connected component.
  const entityIds = entities.map((e) => e.id);
  const components = findConnectedComponents(entityIds, debtEdges);

  const obligations: NetObligation[] = [];
  const balances: NettingResult["balances"] = [];
  let obCounter = 0;

  for (const comp of components) {
    const compSet = new Set(comp);

    // Step 2 — compute each entity's net balance within this component.
    const netMap = new Map<string, number>();
    for (const id of comp) netMap.set(id, 0);

    for (const edge of debtEdges) {
      if (!compSet.has(edge.from) || !compSet.has(edge.to)) continue;
      netMap.set(edge.from, (netMap.get(edge.from) ?? 0) - edge.amountUsd);
      netMap.set(edge.to, (netMap.get(edge.to) ?? 0) + edge.amountUsd);
    }

    // Record balances for the result
    for (const id of comp) {
      const ent = entities.find((e) => e.id === id)!;
      balances.push({
        entityId: id,
        entityName: ent.name.trim(),
        netUsd: Math.round((netMap.get(id) ?? 0) * 100) / 100,
      });
    }

    // Step 3 — split into creditors and debtors.
    const creditors: { id: string; amount: number }[] = [];
    const debtors: { id: string; amount: number }[] = [];

    for (const [id, bal] of netMap) {
      const rounded = Math.round(bal * 100) / 100;
      if (rounded > EPSILON) {
        creditors.push({ id, amount: rounded });
      } else if (rounded < -EPSILON) {
        debtors.push({ id, amount: -rounded }); // store as positive magnitude
      }
    }

    // Sort descending by amount for greedy matching.
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    // Step 4 — greedily match largest debtor to largest creditor.
    let ci = 0; // creditor index
    let di = 0; // debtor index

    while (ci < creditors.length && di < debtors.length) {
      const debtor = debtors[di];
      const creditor = creditors[ci];
      const settleAmount = Math.min(debtor.amount, creditor.amount);

      if (settleAmount <= EPSILON) {
        // skip dust
        if (debtor.amount <= creditor.amount) di++;
        else ci++;
        continue;
      }

      const recipient = entities.find((e) => e.id === creditor.id)!;
      const settlementCurrency = currencyOf(recipient.country);

      obligations.push({
        id: `net-${++obCounter}`,
        from: debtor.id,
        to: creditor.id,
        amountUsd: Math.round(settleAmount * 100) / 100,
        amount: fromUsd(settleAmount, settlementCurrency),
        settlementCurrency,
        status: "pending",
      });

      debtor.amount = Math.round((debtor.amount - settleAmount) * 100) / 100;
      creditor.amount = Math.round((creditor.amount - settleAmount) * 100) / 100;

      if (debtor.amount <= EPSILON) di++;
      if (creditor.amount <= EPSILON) ci++;
    }
  }

  setNetObligations(obligations);

  // Value metrics: what netting saves vs settling every raw debt individually.
  const countryOf = (id: string) => entities.find((e) => e.id === id)?.country ?? "US";
  const pairFeePct = (a: string, b: string): number => {
    const ca = countryOf(a);
    const cb = countryOf(b);
    const local = bestRail(ca, cb, "local");
    if (local) return local.feeEstimatePct;
    const linked = bestRail(ca, cb, "linked");
    if (linked) return linked.feeEstimatePct;
    return bestRail(ca, cb, "stable_bridge")?.feeEstimatePct ?? 1.5;
  };
  const rawTotalUsd = debtEdges.reduce((s, e) => s + e.amountUsd, 0);
  const netTotalUsd = obligations.reduce((s, o) => s + o.amountUsd, 0);
  const naiveFeeUsd = debtEdges.reduce((s, e) => s + (e.amountUsd * pairFeePct(e.from, e.to)) / 100, 0);
  const netFeeUsd = obligations.reduce((s, o) => s + (o.amountUsd * pairFeePct(o.from, o.to)) / 100, 0);

  const summary = {
    rawEdgeCount: debtEdges.length,
    netEdgeCount: obligations.length,
    reductionRatio:
      obligations.length > 0
        ? Math.round((debtEdges.length / obligations.length) * 100) / 100
        : 0,
    transfersSaved: Math.max(0, debtEdges.length - obligations.length),
    rawTotalUsd: Math.round(rawTotalUsd * 100) / 100,
    netTotalUsd: Math.round(netTotalUsd * 100) / 100,
    feeSavingsUsd: Math.round(Math.max(0, naiveFeeUsd - netFeeUsd) * 100) / 100,
    balances: balances.sort((a, b) => b.netUsd - a.netUsd),
  };
  setNettingSummary(summary);

  return {
    obligations,
    ...summary,
  };
}
