import type { Entity, NetObligation } from "../api/client";
import { Avatar } from "./Avatar";
import { RailIcon, IconAlertTriangle } from "./icons";
import { COUNTRY_FLAGS, RAIL_META } from "../lib/theme";

// ──────────────────────────────────────────────
// Per-obligation card. Shows the sender → recipient,
// the amount, the chosen rail with its reasoning
// string, compliance flags, and a settle action.
// ──────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-slate-500/15 text-slate-400 border-slate-500/20" },
  routed: { label: "Routed", cls: "bg-cyan-500/15 text-cyan-300 border-cyan-500/25" },
  settled: { label: "Settled", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" },
};

interface Props {
  obligation: NetObligation;
  fromEntity: Entity;
  toEntity: Entity;
  onSettle: (id: string) => void;
  onOpenClaim: (token: string) => void;
}

export function ObligationCard({ obligation, fromEntity, toEntity, onSettle, onOpenClaim }: Props) {
  const rail = obligation.chosenRail;
  const meta = rail ? RAIL_META[rail] : null;
  const status =
    rail === "claim_link" && obligation.claimToken && obligation.status === "routed"
      ? { label: "Awaiting claim", cls: "bg-amber-500/15 text-amber-300 border-amber-500/25" }
      : STATUS_META[obligation.status] ?? STATUS_META.pending;

  return (
    <div className="glass-strong rounded-2xl p-4 flex flex-col animate-fade-in-up hover:-translate-y-0.5 transition-transform duration-200">
      {/* Top row: route + status */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar id={fromEntity.id} name={fromEntity.name} size={30} />
          <ArrowIcon className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          <Avatar id={toEntity.id} name={toEntity.name} size={30} />
          <div className="ml-1.5 min-w-0">
            <p className="text-[13px] font-semibold text-slate-200 leading-tight truncate">
              {fromEntity.name.trim().split(" ")[0]}
              <span className="text-slate-500 font-normal"> → </span>
              {toEntity.name.trim().split(" ")[0]}
            </p>
            <p className="text-[11px] text-slate-500 leading-tight">
              {COUNTRY_FLAGS[fromEntity.country]} {fromEntity.country}
              <span className="mx-0.5">·</span>
              {COUNTRY_FLAGS[toEntity.country]} {toEntity.country}
            </p>
          </div>
        </div>
        <span className={`chip border ${status.cls}`}>{status.label}</span>
      </div>

      {/* Amount */}
      <div className="mb-3">
        <p className="text-2xl font-bold text-slate-50 tracking-tight font-mono">
          {obligation.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          <span className="text-base font-semibold text-slate-400 ml-1.5">{obligation.settlementCurrency}</span>
        </p>
        <p className="text-xs text-slate-500 font-mono">≈ ${obligation.amountUsd.toFixed(2)} USD</p>
      </div>

      {/* Rail badge */}
      {meta && (
        <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 mb-3 ${meta.soft}`}>
          <RailIcon type={rail!} className={`h-4 w-4 ${meta.text}`} />
          <span className={`text-xs font-semibold ${meta.text}`}>{meta.label}</span>
        </div>
      )}

      {/* Routing reason */}
      {obligation.routingReason && (
        <div className="mb-3 rounded-lg bg-black/25 border border-white/[0.04] px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Why this rail
          </p>
          <p className="text-xs text-slate-300 leading-relaxed">{obligation.routingReason}</p>
        </div>
      )}

      {/* Compliance flags */}
      {obligation.complianceFlags && obligation.complianceFlags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {obligation.complianceFlags.map((f, i) => (
            <span
              key={i}
              className="chip bg-red-500/10 border border-red-500/25 text-red-300"
              title={f.message}
            >
              <IconAlertTriangle className="h-3 w-3" /> {f.type === "limit_exceeded" ? "Limit exceeded" : "Frequency anomaly"}
            </span>
          ))}
        </div>
      )}

      {/* Action */}
      <div className="mt-auto">
        {obligation.status === "routed" && !obligation.claimToken && (
          <button onClick={() => onSettle(obligation.id)} className="btn-primary w-full">
            {rail === "claim_link" ? "Generate claim link" : "Settle transfer"}
          </button>
        )}
        {obligation.claimToken && (
          <button
            onClick={() => onOpenClaim(obligation.claimToken!)}
            className="btn-primary w-full !bg-gradient-to-r !from-amber-500 !to-orange-500"
          >
            Open claim link →
          </button>
        )}
        {obligation.status === "settled" && !obligation.claimToken && (
          <div className="flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-emerald-400">
            <CheckCircleIcon className="h-4 w-4" /> Settled
          </div>
        )}
        {obligation.status === "pending" && (
          <p className="text-center text-sm text-slate-600 py-2.5">Run routing first</p>
        )}
      </div>
    </div>
  );
}

function ArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function CheckCircleIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
