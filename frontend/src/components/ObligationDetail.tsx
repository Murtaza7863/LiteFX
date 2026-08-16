import { useEffect } from "react";

import type { DebtEdge, Entity, NetObligation } from "../api/client";

import { RAIL_META, COUNTRY_FLAGS } from "../lib/theme";
import { Avatar } from "./Avatar";
import { RailIcon, IconX } from "./icons";

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

export function ObligationDetail({
  obligation,
  fromEntity,
  toEntity,
  debtEdges,
  onClose,
}: Props) {
  const meta = obligation.chosenRail ? RAIL_META[obligation.chosenRail] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Raw pairwise debts between these two parties (either direction).
  const consolidated = debtEdges.filter(
    (e) =>
      (e.from === obligation.from && e.to === obligation.to) ||
      (e.from === obligation.to && e.to === obligation.from),
  );

  return (
    <div
      className="bg-black/70 animate-fade-in fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-strong animate-scale-in relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          aria-label="Close"
        >
          <IconX className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="mb-4 flex items-center gap-3 pr-10">
          <Avatar id={fromEntity.id} name={fromEntity.name} size={36} />
          <span className="text-slate-500">→</span>
          <Avatar id={toEntity.id} name={toEntity.name} size={36} />
          <div className="min-w-0">
            <p className="text-slate-100 truncate text-sm font-semibold">
              {fromEntity.name.trim()} → {toEntity.name.trim()}
            </p>
            <p className="text-slate-500 text-[11px]">
              {COUNTRY_FLAGS[fromEntity.country]} {fromEntity.country} →{" "}
              {COUNTRY_FLAGS[toEntity.country]} {toEntity.country}
              {meta ? ` · ${meta.label}` : ""}
            </p>
          </div>
        </div>

        {/* Amount + fee/time */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="bg-black/25 border-white/[0.05] rounded-lg border p-3 text-center">
            <p className="text-slate-500 text-[10px] tracking-wide uppercase">
              Amount
            </p>
            <p className="text-slate-100 font-mono text-sm font-semibold">
              ${obligation.amountUsd.toFixed(2)}
            </p>
          </div>
          <div className="bg-black/25 border-white/[0.05] rounded-lg border p-3 text-center">
            <p className="text-slate-500 text-[10px] tracking-wide uppercase">
              Est. fee
            </p>
            <p className="text-amber-300 font-mono text-sm font-semibold">
              ${(obligation.feeUsd ?? 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-black/25 border-white/[0.05] rounded-lg border p-3 text-center">
            <p className="text-slate-500 text-[10px] tracking-wide uppercase">
              Est. time
            </p>
            <p className="text-slate-100 font-mono text-sm font-semibold">
              {obligation.timeHours ?? "—"}h
            </p>
          </div>
        </div>

        {/* Routing reason */}
        {obligation.routingReason && (
          <div className="bg-black/25 border-white/[0.04] mb-4 rounded-lg border px-3 py-2.5">
            <p className="text-slate-500 mb-1 text-[10px] font-semibold tracking-wider uppercase">
              Why this rail
            </p>
            <p className="text-slate-300 text-xs leading-relaxed">
              {obligation.routingReason}
            </p>
          </div>
        )}

        {/* Considered rails */}
        {obligation.considered && obligation.considered.length > 0 && (
          <div className="mb-4">
            <p className="text-slate-500 mb-2 text-[10px] font-semibold tracking-wider uppercase">
              Rails evaluated
            </p>
            <div className="space-y-1.5">
              {obligation.considered.map((c, i) => {
                const m = RAIL_META[c.type];
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${
                      c.chosen
                        ? "border-cyan-400/40 bg-cyan-400/10"
                        : "border-white/[0.06] bg-white/[0.02] opacity-70"
                    }`}
                  >
                    <span className={m?.text ?? "text-slate-400"}>
                      <RailIcon type={c.type} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-xs font-semibold ${c.chosen ? "text-cyan-200" : "text-slate-300"}`}
                      >
                        {c.railName}
                        {c.chosen && (
                          <span className="text-cyan-300 ml-1.5 text-[9px] tracking-wide uppercase">
                            chosen
                          </span>
                        )}
                      </p>
                      <p className="text-slate-500 truncate text-[10px]">
                        {c.note}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-slate-300 font-mono text-[11px]">
                        {c.feeEstimatePct}%
                      </p>
                      <p className="text-slate-500 font-mono text-[10px]">
                        {c.timeEstimateHours}h
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Consolidated debts */}
        <div>
          <p className="text-slate-500 mb-2 text-[10px] font-semibold tracking-wider uppercase">
            Consolidated pairwise debts ({consolidated.length})
          </p>
          {consolidated.length === 0 ? (
            <p className="text-slate-500 text-xs">
              No direct pairwise debts — this transfer arose from multilateral
              netting.
            </p>
          ) : (
            <div className="space-y-1">
              {consolidated.map((e) => (
                <div
                  key={e.id}
                  className="text-slate-400 bg-white/[0.02] flex items-center justify-between rounded px-2.5 py-1.5 text-[11px]"
                >
                  <span>
                    {e.from === obligation.from
                      ? `${fromEntity.name.split(" ")[0]} → ${toEntity.name.split(" ")[0]}`
                      : `${toEntity.name.split(" ")[0]} → ${fromEntity.name.split(" ")[0]}`}
                  </span>
                  <span className="font-mono">
                    {e.amount.toLocaleString()} {e.currency}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
