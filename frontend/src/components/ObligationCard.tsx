import { useState } from "react";

import type { Entity, NetObligation } from "../api/client";

import { paymentSlip, railSummary } from "../lib/paymentSlip";
import { vsCostliest } from "../lib/settlementRecap";
import { countryFlag, RAIL_META } from "../lib/theme";
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
    cls: "bg-white/[0.06] text-slate-200 border-white/[0.1]",
  },
  settled: {
    label: "Settled",
    cls: "bg-[#9aaa8c]/15 text-[#9aaa8c] border-[#9aaa8c]/25",
  },
};

interface Props {
  obligation: NetObligation;
  fromEntity: Entity;
  toEntity: Entity;
  onSettle: (id: string) => void;
  onOpenClaim: (token: string) => void;
  onOpenDetail: (id: string) => void;
  onCopyError?: () => void;
  busy?: boolean;
  className?: string;
}

export function ObligationCard({
  obligation,
  fromEntity,
  toEntity,
  onSettle,
  onOpenClaim,
  onOpenDetail,
  onCopyError,
  busy = false,
  className = "",
}: Props) {
  const rail = obligation.chosenRail;
  const meta = rail ? RAIL_META[rail] : null;
  const slip = paymentSlip(obligation, fromEntity, toEntity);
  const pick = railSummary(obligation);
  const saveVs = vsCostliest(obligation);
  const [copied, setCopied] = useState(false);
  const status =
    rail === "claim_link" &&
    obligation.claimToken &&
    obligation.status === "routed"
      ? {
          label: "Awaiting claim",
          cls: "bg-[#c4a574]/15 text-[#c4a574] border-[#c4a574]/25",
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
              {countryFlag(fromEntity.country)} {fromEntity.country}
              <span className="mx-0.5">·</span>
              {countryFlag(toEntity.country)} {toEntity.country}
            </p>
          </div>
        </div>
        <span className={`chip shrink-0 border ${status.cls}`}>
          {status.label}
        </span>
      </div>

      <div className="mb-2.5 flex items-end justify-between gap-2">
        <div>
          <p className="text-slate-50 font-display tnum text-[1.45rem] font-semibold tracking-[-0.03em]">
            {obligation.amount.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
            <span className="text-slate-400 ml-1.5 font-sans text-sm font-medium tracking-normal">
              {obligation.settlementCurrency}
            </span>
          </p>
          {obligation.settlementCurrency !== "USD" && (
            <p className="text-slate-500 font-mono text-[11px]">
              ≈ ${obligation.amountUsd.toFixed(2)} USD
            </p>
          )}
        </div>
        {meta && (
          <div
            className={`flex max-w-[58%] flex-col items-end rounded-lg border px-2 py-1 ${meta.soft}`}
          >
            <span
              className={`flex items-center gap-1 text-[11px] font-semibold ${meta.text}`}
            >
              <RailIcon type={rail!} className={`h-3.5 w-3.5 ${meta.text}`} />
              {pick.name}
            </span>
            {pick.feePct != null && (
              <span className="text-slate-500 text-[10px]">
                {pick.feePct}%
                {pick.feeUsd > 0 ? ` · $${pick.feeUsd.toFixed(2)}` : ""}
              </span>
            )}
            {saveVs && (
              <span className="text-[#9aaa8c] text-[10px]">
                saves ${saveVs.savingsUsd.toFixed(2)} vs {saveVs.name}
              </span>
            )}
          </div>
        )}
      </div>

      {obligation.complianceFlags && obligation.complianceFlags.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {obligation.complianceFlags.map((f, i) => (
            <span
              key={i}
              className="chip border border-[#c48878]/25 bg-[#c48878]/10 text-[#c48878]"
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
            disabled={busy}
            className="btn-primary w-full"
          >
            {busy
              ? "Working…"
              : rail === "claim_link"
                ? "Generate claim link"
                : "Settle transfer"}
          </button>
        )}
        {obligation.claimToken && obligation.status !== "settled" && (
          <button
            onClick={() => onOpenClaim(obligation.claimToken!)}
            disabled={busy}
            className="btn-primary w-full"
          >
            Open claim link →
          </button>
        )}
        {obligation.status === "settled" && (
          <div className="flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-[#9aaa8c]">
            <CheckCircleIcon className="h-4 w-4" /> Settled
          </div>
        )}
        {obligation.status === "pending" && (
          <p className="text-slate-600 py-2.5 text-center text-sm">
            Waiting for the agent to pick a rail
          </p>
        )}
      </div>

      {obligation.chosenRail && (
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(slip.text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              onCopyError?.();
            }
          }}
          className="text-slate-500 hover:text-slate-200 mt-1.5 w-full text-center text-[11px] font-medium transition-colors"
        >
          {copied ? "Instructions copied" : "Copy send instructions"}
        </button>
      )}

      {obligation.considered && obligation.considered.length > 0 && (
        <button
          onClick={() => onOpenDetail(obligation.id)}
          className="text-slate-500 hover:text-slate-200 mt-1 w-full text-center text-[11px] font-medium transition-colors"
        >
          Try another rail →
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
