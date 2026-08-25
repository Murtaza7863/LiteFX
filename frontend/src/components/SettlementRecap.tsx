import { useEffect, useMemo, useState } from "react";

import type { Entity, NetObligation, NettingResult } from "../api/client";

import {
  railMix,
  recapText,
  settleProgress,
  totalFeesUsd,
} from "../lib/settlementRecap";
import { booksCloseUsd } from "../lib/tripMath";
import { IconChevron, IconShare } from "./icons";

function useCountUp(target: number, duration = 700): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

export function SettlementRecap({
  result,
  obligations,
  tripName,
  entityOf,
  onCopied,
}: {
  result: NettingResult;
  obligations: NetObligation[];
  tripName: string;
  entityOf: (id: string) => Entity | undefined;
  onCopied: (msg: string) => void;
}) {
  const pct = Math.max(
    6,
    Math.round((result.netEdgeCount / Math.max(result.rawEdgeCount, 1)) * 100),
  );
  const saved = useCountUp(result.transfersSaved);
  const fees = useCountUp(result.feeSavingsUsd);
  const moved = useCountUp(result.netTotalUsd);
  const corridor = useCountUp(result.corridorSavingsUsd ?? 0);
  const [open, setOpen] = useState(true);
  const mix = useMemo(() => railMix(obligations), [obligations]);
  const progress = settleProgress(obligations);
  const feeTotal = totalFeesUsd(obligations);
  const recap = useMemo(
    () => recapText({ tripName, netting: result, obligations, entityOf }),
    [tripName, result, obligations, entityOf],
  );

  const copyRecap = async () => {
    try {
      await navigator.clipboard.writeText(recap);
      onCopied("Trip recap copied");
    } catch {
      onCopied("Could not copy recap");
    }
  };

  return (
    <section className="glass animate-fade-in-up overflow-hidden rounded-2xl">
      <div className="flex items-center gap-2 px-4 py-3.5 sm:px-5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="hover:bg-white/[0.03] -mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-0.5 text-left transition-colors"
          aria-expanded={open}
        >
          <div className="min-w-0 flex-1">
            <p className="text-slate-100 font-display text-[1.2rem] font-semibold tracking-[-0.03em] sm:text-[1.35rem]">
              <span className="tnum">{result.rawEdgeCount}</span>
              <span className="text-slate-500 mx-1.5 font-sans text-sm font-medium tracking-normal">
                IOUs
              </span>
              <span className="text-slate-500 font-sans text-sm font-medium">
                →
              </span>
              <span className="tnum ml-1.5">{result.netEdgeCount}</span>
              <span className="text-slate-500 ml-1.5 font-sans text-sm font-medium tracking-normal">
                transfers
              </span>
            </p>
            <p className="text-slate-500 mt-0.5 truncate text-xs">
              {result.reductionRatio}× fewer payments · $
              {result.feeSavingsUsd.toFixed(2)} fees saved
              {(result.corridorSavingsUsd ?? 0) > 0
                ? ` · $${result.corridorSavingsUsd!.toFixed(2)} vs largest-first`
                : ""}
            </p>
          </div>
          <span className="chip hidden shrink-0 border border-[#9aaa8c]/25 bg-[#9aaa8c]/15 text-[#9aaa8c] sm:inline-flex">
            ↓ {result.reductionRatio}×
          </span>
          <IconChevron
            className={`text-slate-500 h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        <button
          type="button"
          onClick={() => void copyRecap()}
          className="btn-ghost shrink-0 !px-2.5 !py-1 text-[11px]"
        >
          <IconShare className="h-3 w-3" />
          Copy recap
        </button>
      </div>
      {open && (
        <div className="px-4 pb-4 sm:px-5">
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              value={Math.round(saved).toString()}
              label="transfers saved"
            />
            <Stat
              value={`$${fees.toFixed(2)}`}
              label="est. fees saved"
              accent
            />
            <Stat
              value={`$${corridor.toFixed(2)}`}
              label="vs largest-first"
            />
            <Stat
              value={`$${moved.toFixed(2)}`}
              label="to move"
              strike={
                result.rawTotalUsd > result.netTotalUsd
                  ? `$${result.rawTotalUsd.toFixed(0)}`
                  : undefined
              }
            />
          </div>

          {mix.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {mix.map((m) => (
                <span
                  key={m.name}
                  className="chip border-[var(--border)] bg-white/[0.04] text-slate-300"
                >
                  {m.name}
                  {m.count > 1 ? ` ×${m.count}` : ""}
                </span>
              ))}
              {feeTotal > 0 && (
                <span className="chip border-[var(--border)] bg-white/[0.04] text-slate-400">
                  ${feeTotal.toFixed(2)} rail fees
                </span>
              )}
            </div>
          )}

          <p className="text-slate-500 mb-4 text-[12px] leading-relaxed">
            Matched cheapest corridors first (same-country, SEPA, then linked
            rails) instead of largest-debtor to largest-creditor.
            {(result.greedyFeeUsd ?? 0) > 0
              ? ` A Splitwise-style match would have cost about $${result.greedyFeeUsd!.toFixed(2)} in rail fees.`
              : ""}{" "}
            {booksCloseUsd(result.balances).closed
              ? "Net balances sum to $0.00. The books close."
              : "Net balances should sum to $0.00."}
          </p>

          <div className="space-y-3">
            <Bar
              label={`Without netting · ${result.rawEdgeCount} payments`}
              width={100}
              muted
              value={result.rawEdgeCount}
            />
            <Bar
              label={`With LiteFX · ${result.netEdgeCount} payments`}
              width={pct}
              value={result.netEdgeCount}
            />
          </div>

          {progress.total > 0 && (
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-slate-500 text-xs">
                  {progress.settled === progress.total
                    ? "All transfers settled"
                    : `${progress.settled} of ${progress.total} settled`}
                </span>
                <span className="text-slate-400 tnum text-xs">
                  {progress.pct}%
                </span>
              </div>
              <div className="bg-white/[0.06] h-1.5 overflow-hidden rounded-sm">
                <div
                  className="h-full bg-[#9aaa8c] transition-all duration-700"
                  style={{ width: `${Math.max(progress.pct, 0)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({
  value,
  label,
  accent = false,
  strike,
}: {
  value: string;
  label: string;
  accent?: boolean;
  strike?: string;
}) {
  return (
    <div className="bg-black/25 border-white/[0.05] rounded-xl border p-3 text-center">
      <p
        className={`font-display tnum text-[1.55rem] font-semibold ${
          accent ? "text-[#9aaa8c]" : "text-slate-50"
        }`}
      >
        {value}
      </p>
      <p className="section-title mt-0.5">
        {label}
        {strike && (
          <>
            {" "}
            <span className="text-slate-600 tracking-normal whitespace-nowrap normal-case line-through">
              {strike}
            </span>
          </>
        )}
      </p>
    </div>
  );
}

function Bar({
  label,
  width,
  value,
  muted = false,
}: {
  label: string;
  width: number;
  value: number;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-slate-500 text-xs">{label}</span>
        <span
          className={`tnum font-mono text-sm ${muted ? "text-slate-400" : "text-slate-200 font-semibold"}`}
        >
          {value}
        </span>
      </div>
      <div className="bg-white/[0.06] h-1.5 overflow-hidden rounded-sm">
        <div
          className={`h-full ${muted ? "bg-slate-500 w-full" : "bg-[var(--text)]"} transition-all duration-700`}
          style={muted ? undefined : { width: `${width}%` }}
        />
      </div>
    </div>
  );
}
