import { useMemo } from "react";

import type { DebtEdge, Entity, NetObligation } from "../api/client";

import { RAIL_META } from "../lib/theme";
import { railSummary } from "../lib/paymentSlip";
import { Avatar } from "./Avatar";

interface Props {
  entities: Entity[];
  debtEdges: DebtEdge[];
  obligations: NetObligation[];
  mode: "raw" | "netted";
  onOpenDetail?: (id: string) => void;
}

interface Flow {
  id: string;
  from: string;
  to: string;
  amount: number;
  currency: string;
  amountUsd: number;
  rail?: string;
  railName?: string;
}

export function DebtGraph({
  entities,
  debtEdges,
  obligations,
  mode,
  onOpenDetail,
}: Props) {
  const entityMap = useMemo(
    () => new Map(entities.map((e) => [e.id, e])),
    [entities],
  );

  const flows = useMemo<Flow[]>(() => {
    const raw: Flow[] =
      mode === "netted"
        ? obligations.map((o) => ({
            id: o.id,
            from: o.from,
            to: o.to,
            amount: o.amount,
            currency: o.settlementCurrency,
            amountUsd: o.amountUsd,
            rail: o.chosenRail,
            railName: railSummary(o).name,
          }))
        : debtEdges.map((e) => ({
            id: e.id,
            from: e.from,
            to: e.to,
            amount: e.amount,
            currency: e.currency,
            amountUsd: e.amountUsd,
          }));

    if (mode === "netted") return raw;

    const merged = new Map<string, Flow>();
    for (const f of raw) {
      const key = `${f.from}|${f.to}|${f.currency}`;
      const prev = merged.get(key);
      if (!prev) {
        merged.set(key, { ...f });
        continue;
      }
      prev.amount = Math.round((prev.amount + f.amount) * 100) / 100;
      prev.amountUsd =
        Math.round((prev.amountUsd + f.amountUsd) * 10000) / 10000;
    }
    return [...merged.values()];
  }, [mode, obligations, debtEdges]);

  const groups = useMemo(() => {
    const byFrom = new Map<string, Flow[]>();
    for (const f of flows) {
      const list = byFrom.get(f.from) ?? [];
      list.push(f);
      byFrom.set(f.from, list);
    }
    return [...byFrom.entries()]
      .map(([from, items]) => ({
        from,
        items: items.sort((a, b) => b.amountUsd - a.amountUsd),
        totalUsd: items.reduce((s, x) => s + x.amountUsd, 0),
      }))
      .sort((a, b) => b.totalUsd - a.totalUsd);
  }, [flows]);

  if (entities.length === 0 || flows.length === 0) {
    return (
      <p className="text-slate-500 py-2 text-sm">
        {mode === "netted"
          ? "No transfers yet. Run netting first."
          : "No debts yet."}
      </p>
    );
  }

  return (
    <div className="divide-white/[0.06] divide-y">
      {groups.map((g) => {
        const debtor = entityMap.get(g.from);
        if (!debtor) return null;
        return (
          <div key={g.from} className="py-2.5 first:pt-0 last:pb-0">
            <div className="mb-1.5 flex items-center gap-2">
              <Avatar id={debtor.id} name={debtor.name} size={22} />
              <p className="text-slate-300 truncate text-[13px] font-medium">
                {debtor.name.trim()}
                <span className="text-slate-500 font-normal"> owes</span>
              </p>
            </div>
            <ul className="space-y-0.5 pl-7">
              {g.items.map((f) => {
                const creditor = entityMap.get(f.to);
                if (!creditor) return null;
                const meta = f.rail ? RAIL_META[f.rail] : null;
                const inner = (
                  <>
                    <span className="text-slate-600 text-[11px]">→</span>
                    <Avatar id={creditor.id} name={creditor.name} size={18} />
                    <span className="text-slate-400 min-w-0 flex-1 truncate text-[13px]">
                      {creditor.name.trim()}
                    </span>
                    <span className="text-slate-200 tnum shrink-0 font-mono text-[13px]">
                      {f.amount.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}{" "}
                      <span className="text-slate-500">{f.currency}</span>
                    </span>
                    {f.currency !== "USD" && (
                      <span className="text-slate-600 tnum hidden shrink-0 font-mono text-[11px] sm:inline">
                        ≈ ${f.amountUsd.toFixed(0)}
                      </span>
                    )}
                    {meta && (
                      <span
                        className={`chip inline-flex shrink-0 border !px-1.5 !py-0 !text-[9px] sm:!text-[10px] ${meta.soft} ${meta.text}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${meta.dot}`}
                        />
                        <span className="hidden min-[420px]:inline">
                          {f.railName ?? meta.label}
                        </span>
                      </span>
                    )}
                  </>
                );
                const rowCls =
                  "flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left";
                return (
                  <li key={f.id}>
                    {mode === "netted" && onOpenDetail ? (
                      <button
                        type="button"
                        onClick={() => onOpenDetail(f.id)}
                        className={`${rowCls} hover:bg-white/[0.04] transition-colors`}
                      >
                        {inner}
                      </button>
                    ) : (
                      <div className={rowCls}>{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
