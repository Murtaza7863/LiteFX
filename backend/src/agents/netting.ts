import type { DebtEdge, Entity, NetObligation } from "../types";
import { currencyOf, fromUsd } from "../types";
import { getStore, setNetObligations, setNettingSummary } from "../store";
import { cheapestRail, feePctForPair } from "../data/railOptions";

// ──────────────────────────────────────────────
// Agent 1 — Netting agent
//
// Turns many pairwise, multi-currency debts into the
// fewest cheap transfers:
//   1. Convert everything to USD and compute net balances
//      (who owes / is owed after all expenses).
//   2. Match debtors to creditors by cheapest corridor
//      first (local / SEPA → linked → claim link → USDC),
//      not "largest debtor pays largest creditor".
//
// Splitwise-style largest-first is still computed as a
// baseline so the UI can show extra fee savings from
// corridor-aware matching.
// ──────────────────────────────────────────────

const EPSILON = 0.005; // half a cent — anything below this is "zero"

interface Party {
  id: string;
  amount: number;
}

/** Find connected components in the debt graph using BFS. */
function findConnectedComponents(
  entityIds: string[],
  edges: DebtEdge[],
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

function cloneParties(parties: Party[]): Party[] {
  return parties.map((p) => ({ ...p }));
}

function entityById(entities: Entity[], id: string): Entity | undefined {
  return entities.find((e) => e.id === id);
}

function hasAccount(ent: Entity | undefined): boolean {
  return !!ent && ent.linkedRailAliases.length > 0;
}

function makeObligation(
  id: string,
  debtorId: string,
  creditorId: string,
  settleUsd: number,
  entities: Entity[],
  matchReason?: string,
): NetObligation {
  const recipient = entityById(entities, creditorId);
  const settlementCurrency = currencyOf(recipient?.country ?? "US");
  return {
    id,
    from: debtorId,
    to: creditorId,
    amountUsd: Math.round(settleUsd * 100) / 100,
    amount: fromUsd(settleUsd, settlementCurrency),
    settlementCurrency,
    status: "pending",
    matchReason,
  };
}

/** Classic Splitwise simplify: largest debtor → largest creditor. */
export function matchGreedy(
  debtors: Party[],
  creditors: Party[],
  entities: Entity[],
): NetObligation[] {
  const ds = cloneParties(debtors).sort((a, b) => b.amount - a.amount);
  const cs = cloneParties(creditors).sort((a, b) => b.amount - a.amount);
  const obligations: NetObligation[] = [];
  let ci = 0;
  let di = 0;
  let n = 0;

  while (ci < cs.length && di < ds.length) {
    const debtor = ds[di];
    const creditor = cs[ci];
    const settleAmount = Math.min(debtor.amount, creditor.amount);

    if (settleAmount <= EPSILON) {
      if (debtor.amount <= creditor.amount) di++;
      else ci++;
      continue;
    }

    obligations.push(
      makeObligation(
        `g-${++n}`,
        debtor.id,
        creditor.id,
        settleAmount,
        entities,
      ),
    );

    debtor.amount = Math.round((debtor.amount - settleAmount) * 100) / 100;
    creditor.amount = Math.round((creditor.amount - settleAmount) * 100) / 100;
    if (debtor.amount <= EPSILON) di++;
    if (creditor.amount <= EPSILON) ci++;
  }

  return obligations;
}

/**
 * Prefer cheap corridors: repeatedly settle the remaining
 * debtor–creditor pair with the lowest fee, breaking ties
 * by larger amount (keeps the transfer count down).
 */
export function matchCheapestCorridor(
  debtors: Party[],
  creditors: Party[],
  entities: Entity[],
): NetObligation[] {
  const ds = cloneParties(debtors);
  const cs = cloneParties(creditors);
  const obligations: NetObligation[] = [];
  let n = 0;

  while (true) {
    let best: {
      di: number;
      ci: number;
      settle: number;
      feePct: number;
      railName: string;
    } | null = null;

    for (let di = 0; di < ds.length; di++) {
      if (ds[di].amount <= EPSILON) continue;
      const sender = entityById(entities, ds[di].id);
      if (!sender) continue;
      for (let ci = 0; ci < cs.length; ci++) {
        if (cs[ci].amount <= EPSILON) continue;
        const recipient = entityById(entities, cs[ci].id);
        if (!recipient) continue;
        const pick = cheapestRail(
          sender.country,
          recipient.country,
          hasAccount(recipient),
        );
        const settle = Math.min(ds[di].amount, cs[ci].amount);
        if (
          !best ||
          pick.feeEstimatePct < best.feePct - 1e-9 ||
          (Math.abs(pick.feeEstimatePct - best.feePct) < 1e-9 &&
            settle > best.settle)
        ) {
          best = {
            di,
            ci,
            settle,
            feePct: pick.feeEstimatePct,
            railName: pick.railName,
          };
        }
      }
    }

    if (!best || best.settle <= EPSILON) break;

    const sender = entityById(entities, ds[best.di].id);
    const recipient = entityById(entities, cs[best.ci].id);
    const reason = `Matched ${sender?.name.trim() ?? ds[best.di].id} → ${recipient?.name.trim() ?? cs[best.ci].id} on ${best.railName} (${best.feePct}% fee) — cheapest remaining corridor.`;

    obligations.push(
      makeObligation(
        `net-${++n}`,
        ds[best.di].id,
        cs[best.ci].id,
        best.settle,
        entities,
        reason,
      ),
    );

    ds[best.di].amount =
      Math.round((ds[best.di].amount - best.settle) * 100) / 100;
    cs[best.ci].amount =
      Math.round((cs[best.ci].amount - best.settle) * 100) / 100;
  }

  return obligations;
}

function feesFor(obligations: NetObligation[], entities: Entity[]): number {
  let total = 0;
  for (const o of obligations) {
    const sender = entityById(entities, o.from);
    const recipient = entityById(entities, o.to);
    const pct = feePctForPair(
      sender?.country ?? "US",
      recipient?.country ?? "US",
      hasAccount(recipient),
    );
    total += (o.amountUsd * pct) / 100;
  }
  return Math.round(total * 100) / 100;
}

export interface NettingResult {
  obligations: NetObligation[];
  rawEdgeCount: number;
  netEdgeCount: number;
  reductionRatio: number;
  transfersSaved: number;
  rawTotalUsd: number;
  netTotalUsd: number;
  feeSavingsUsd: number;
  greedyFeeUsd: number;
  corridorSavingsUsd: number;
  balances: { entityId: string; entityName: string; netUsd: number }[];
}

export function runNetting(): NettingResult {
  const store = getStore();
  const entities = store.entities;
  const debtEdges = store.debtEdges;

  const entityIds = entities.map((e) => e.id);
  const components = findConnectedComponents(entityIds, debtEdges);

  const obligations: NetObligation[] = [];
  const greedyAll: NetObligation[] = [];
  const balances: NettingResult["balances"] = [];
  let cheapCounter = 0;
  let greedyCounter = 0;

  for (const comp of components) {
    const compSet = new Set(comp);

    const netMap = new Map<string, number>();
    for (const id of comp) netMap.set(id, 0);

    for (const edge of debtEdges) {
      if (!compSet.has(edge.from) || !compSet.has(edge.to)) continue;
      netMap.set(edge.from, (netMap.get(edge.from) ?? 0) - edge.amountUsd);
      netMap.set(edge.to, (netMap.get(edge.to) ?? 0) + edge.amountUsd);
    }

    for (const id of comp) {
      const ent = entities.find((e) => e.id === id);
      if (!ent) continue;
      balances.push({
        entityId: id,
        entityName: ent.name.trim(),
        netUsd: Math.round((netMap.get(id) ?? 0) * 100) / 100,
      });
    }

    const creditors: Party[] = [];
    const debtors: Party[] = [];

    for (const [id, bal] of netMap) {
      const rounded = Math.round(bal * 100) / 100;
      if (rounded > EPSILON) {
        creditors.push({ id, amount: rounded });
      } else if (rounded < -EPSILON) {
        debtors.push({ id, amount: -rounded });
      }
    }

    const cheap = matchCheapestCorridor(debtors, creditors, entities);
    for (const o of cheap) {
      o.id = `net-${++cheapCounter}`;
      obligations.push(o);
    }

    const greedy = matchGreedy(debtors, creditors, entities);
    for (const o of greedy) {
      o.id = `g-${++greedyCounter}`;
      greedyAll.push(o);
    }
  }

  setNetObligations(obligations);

  const countryOf = (id: string) =>
    entities.find((e) => e.id === id)?.country ?? "US";
  const accountOf = (id: string) => hasAccount(entityById(entities, id));

  const rawTotalUsd = debtEdges.reduce((s, e) => s + e.amountUsd, 0);
  const netTotalUsd = obligations.reduce((s, o) => s + o.amountUsd, 0);
  const naiveFeeUsd = debtEdges.reduce((s, e) => {
    const pct = feePctForPair(
      countryOf(e.from),
      countryOf(e.to),
      accountOf(e.to),
    );
    return s + (e.amountUsd * pct) / 100;
  }, 0);
  const netFeeUsd = feesFor(obligations, entities);
  const greedyFeeUsd = feesFor(greedyAll, entities);

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
    greedyFeeUsd,
    corridorSavingsUsd:
      Math.round(Math.max(0, greedyFeeUsd - netFeeUsd) * 100) / 100,
    balances: balances.sort((a, b) => b.netUsd - a.netUsd),
  };
  setNettingSummary(summary);

  return {
    obligations,
    ...summary,
  };
}
