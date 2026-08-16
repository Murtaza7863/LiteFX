import type { Entity, NetObligation } from "../api/client";

import { COUNTRY_FLAGS, RAIL_META } from "../lib/theme";
import { Avatar } from "./Avatar";
import { RailIcon, IconAlertTriangle } from "./icons";

// ──────────────────────────────────────────────
// Per-obligation card: who pays whom, amount, rail, settle.
// ──────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: {
    label: "Pending",
    cls: "bg-slate-500/15 text-slate-400 border-slate-500/20",
  },
  routed: {
    label: "Routed",
    cls: "bg-cyan-500/15 text-cyan-300 border-cyan-500/25",
  },
  settled: {
    label: "Settled",
    cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  },
};

interface Props {
  obligation: NetObligation;
  fromEntity: Entity;
  toEntity: Entity;
  onSettle: (id: string) => void;
  onOpenClaim: (token: string) => void;
  onOpenDetail: (id: string) => void;
  className?: string;
}

export function ObligationCard({
  obligation,
  fromEntity,
  toEntity,
  onSettle,
  onOpenClaim,
  onOpenDetail,
  className = "",
}: Props) {
  const rail = obligation.chosenRail;
  const meta = rail ? RAIL_META[rail] : null;
  const status =
    rail === "claim_link" &&
    obligation.claimToken &&
    obligation.status === "routed"
      ? {
          label: "Awaiting claim",
          cls: "bg-amber-500/15 text-amber-300 border-amber-500/25",
        }
      : (STATUS_META[obligation.status] ?? STATUS_META.pending);

  return (
    <div
      className={`glass-strong animate-fade-in-up flex flex-col rounded-2xl p-3.5 ${className}`}
    >
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar id={fromEntity.id} name={fromEntity.name} size={26} />
          <ArrowIcon className="text-slate-500 h-3 w-3 shrink-0" />
          <Avatar id={toEntity.id} name={toEntity.name} size={26} />
          <div className="ml-1 min-w-0">
            <p className="text-slate-200 truncate text-[13px] leading-tight font-semibold">
              {fromEntity.name.trim().split(" ")[0]}
              <span className="text-slate-500 font-normal"> → </span>
              {toEntity.name.trim().split(" ")[0]}
            </p>
            <p className="text-slate-500 text-[11px] leading-tight">
              {COUNTRY_FLAGS[fromEntity.country]} {fromEntity.country}
              <span className="mx-0.5">·</span>
              {COUNTRY_FLAGS[toEntity.country]} {toEntity.country}
            </p>
          </div>
        </div>
        <span className={`chip shrink-0 border ${status.cls}`}>
          {status.label}
        </span>
      </div>

      <div className="mb-2.5 flex items-end justify-between gap-2">
        <div>
          <p className="text-slate-50 font-mono text-xl font-bold tracking-tight">
            {obligation.amount.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
            <span className="text-slate-400 ml-1 text-sm font-semibold">
              {obligation.settlementCurrency}
            </span>
          </p>
          <p className="text-slate-500 font-mono text-[11px]">
            ≈ ${obligation.amountUsd.toFixed(2)} USD
          </p>
        </div>
        {meta && (
          <div
            className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 ${meta.soft}`}
          >
            <RailIcon type={rail!} className={`h-3.5 w-3.5 ${meta.text}`} />
            <span className={`text-[11px] font-semibold ${meta.text}`}>
              {meta.label}
            </span>
          </div>
        )}
      </div>

      {obligation.complianceFlags && obligation.complianceFlags.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {obligation.complianceFlags.map((f, i) => (
            <span
              key={i}
              className="chip bg-red-500/10 border-red-500/25 text-red-300 border"
              title={f.message}
            >
              <IconAlertTriangle className="h-3 w-3" />{" "}
              {f.type === "limit_exceeded"
                ? "Limit exceeded"
                : "Frequency anomaly"}
            </span>
          ))}
        </div>
      )}

      {/* Action */}
      <div className="mt-auto">
        {obligation.status === "routed" && !obligation.claimToken && (
          <button
            onClick={() => onSettle(obligation.id)}
            className="btn-primary w-full"
          >
            {rail === "claim_link" ? "Generate claim link" : "Settle transfer"}
          </button>
        )}
        {obligation.claimToken && (
          <button
            onClick={() => onOpenClaim(obligation.claimToken!)}
            className="btn-primary !from-amber-500 !to-orange-500 w-full !bg-gradient-to-r"
          >
            Open claim link →
          </button>
        )}
        {obligation.status === "settled" && !obligation.claimToken && (
          <div className="text-emerald-400 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium">
            <CheckCircleIcon className="h-4 w-4" /> Settled
          </div>
        )}
        {obligation.status === "pending" && (
          <p className="text-slate-600 py-2.5 text-center text-sm">
            Run routing first
          </p>
        )}
      </div>

      {obligation.considered && obligation.considered.length > 0 && (
        <button
          onClick={() => onOpenDetail(obligation.id)}
          className="text-slate-500 hover:text-cyan-300 mt-2 w-full text-center text-[11px] font-medium transition-colors"
        >
          View routing decision →
        </button>
      )}
    </div>
  );
}

function ArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function CheckCircleIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
