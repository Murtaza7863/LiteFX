import type { DebtEdge, Entity, NetObligation } from "../api/client";
import { Avatar } from "./Avatar";
import { RailIcon, IconX } from "./icons";
import { RAIL_META, COUNTRY_FLAGS } from "../lib/theme";

// ──────────────────────────────────────────────
// Obligation detail: shows the routing DECISION —
// the rails the router evaluated (chosen vs
// alternatives, with fee/time), plus the raw pairwise
// debts that were consolidated into this transfer.
// ──────────────────────────────────────────────

interface Props {
  obligation: NetObligation;
  fromEntity: Entity;
  toEntity: Entity;
  debtEdges: DebtEdge[];
  onClose: () => void;
}

export function ObligationDetail({ obligation, fromEntity, toEntity, debtEdges, onClose }: Props) {
  const meta = obligation.chosenRail ? RAIL_META[obligation.chosenRail] : null;

  // Raw pairwise debts between these two parties (either direction).
  const consolidated = debtEdges.filter(
    (e) =>
      (e.from === obligation.from && e.to === obligation.to) ||
      (e.from === obligation.to && e.to === obligation.from)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
      <div
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto glass-strong rounded-2xl p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 h-8 w-8 flex items-center justify-center rounded-full text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
          aria-label="Close"
        >
          <IconX className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Avatar id={fromEntity.id} name={fromEntity.name} size={36} />
          <span className="text-slate-500">→</span>
          <Avatar id={toEntity.id} name={toEntity.name} size={36} />
          <div>
            <p className="text-sm font-semibold text-slate-100">
              {fromEntity.name.trim()} → {toEntity.name.trim()}
            </p>
            <p className="text-[11px] text-slate-500">
              {COUNTRY_FLAGS[fromEntity.country]} {fromEntity.country} → {COUNTRY_FLAGS[toEntity.country]} {toEntity.country}
            </p>
          </div>
        </div>

        {/* Amount + fee/time */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="rounded-lg bg-black/25 border border-white/[0.05] p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Amount</p>
            <p className="font-mono text-sm font-semibold text-slate-100">${obligation.amountUsd.toFixed(2)}</p>
          </div>
          <div className="rounded-lg bg-black/25 border border-white/[0.05] p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Est. fee</p>
            <p className="font-mono text-sm font-semibold text-amber-300">${(obligation.feeUsd ?? 0).toFixed(2)}</p>
          </div>
          <div className="rounded-lg bg-black/25 border border-white/[0.05] p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Est. time</p>
            <p className="font-mono text-sm font-semibold text-slate-100">{obligation.timeHours ?? "—"}h</p>
          </div>
        </div>

        {/* Routing reason */}
        {obligation.routingReason && (
          <div className="rounded-lg bg-black/25 border border-white/[0.04] px-3 py-2.5 mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Why this rail</p>
            <p className="text-xs text-slate-300 leading-relaxed">{obligation.routingReason}</p>
          </div>
        )}

        {/* Considered rails */}
        {obligation.considered && obligation.considered.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Rails evaluated</p>
            <div className="space-y-1.5">
              {obligation.considered.map((c, i) => {
                const m = RAIL_META[c.type];
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${
                      c.chosen ? "border-cyan-400/40 bg-cyan-400/10" : "border-white/[0.06] bg-white/[0.02] opacity-70"
                    }`}
                  >
                    <span className={m?.text ?? "text-slate-400"}>
                      <RailIcon type={c.type} className="h-4 w-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold ${c.chosen ? "text-cyan-200" : "text-slate-300"}`}>
                        {c.railName}
                        {c.chosen && <span className="ml-1.5 text-[9px] uppercase tracking-wide text-cyan-300">chosen</span>}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">{c.note}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-[11px] text-slate-300">{c.feeEstimatePct}%</p>
                      <p className="font-mono text-[10px] text-slate-500">{c.timeEstimateHours}h</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Consolidated debts */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Consolidated pairwise debts ({consolidated.length})
          </p>
          {consolidated.length === 0 ? (
            <p className="text-xs text-slate-500">No direct pairwise debts — this transfer arose from multilateral netting.</p>
          ) : (
            <div className="space-y-1">
              {consolidated.map((e) => (
                <div key={e.id} className="flex items-center justify-between text-[11px] text-slate-400 rounded bg-white/[0.02] px-2.5 py-1.5">
                  <span>{e.from === obligation.from ? `${fromEntity.name.split(" ")[0]} → ${toEntity.name.split(" ")[0]}` : `${toEntity.name.split(" ")[0]} → ${fromEntity.name.split(" ")[0]}`}</span>
                  <span className="font-mono">{e.amount.toLocaleString()} {e.currency}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
