import { useEffect, useRef, useState } from "react";

import type { DebtEdge, Entity, NetObligation } from "../api/client";

import { paymentSlip } from "../lib/paymentSlip";
import { RAIL_META, countryFlag } from "../lib/theme";
import { Avatar } from "./Avatar";
import { RailIcon, IconX } from "./icons";

interface Props {
  obligation: NetObligation;
  fromEntity: Entity;
  toEntity: Entity;
  debtEdges: DebtEdge[];
  onClose: () => void;
  onOverride?: (railName: string) => void;
  onLink?: () => void;
  busy?: boolean;
}

export function ObligationDetail({
  obligation,
  fromEntity,
  toEntity,
  debtEdges,
  onClose,
  onOverride,
  onLink,
  busy = false,
}: Props) {
  const meta = obligation.chosenRail ? RAIL_META[obligation.chosenRail] : null;
  const slip = paymentSlip(obligation, fromEntity, toEntity);
  const [copied, setCopied] = useState(false);
  const canEdit = obligation.status !== "settled" && !busy;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  const consolidated = debtEdges.filter(
    (e) =>
      (e.from === obligation.from && e.to === obligation.to) ||
      (e.from === obligation.to && e.to === obligation.from),
  );

  const [copyFailed, setCopyFailed] = useState(false);
  const copySlip = async () => {
    try {
      await navigator.clipboard.writeText(slip.text);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopyFailed(true);
    }
  };

  return (
    <div
      className="animate-fade-in bg-black/60 fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="glass-strong animate-scale-in relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="routing-detail-title"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          aria-label="Close"
        >
          <IconX className="h-4 w-4" />
        </button>

        <div className="mb-4 flex items-center gap-3 pr-10">
          <Avatar id={fromEntity.id} name={fromEntity.name} size={36} />
          <span className="text-slate-500">→</span>
          <Avatar id={toEntity.id} name={toEntity.name} size={36} />
          <div className="min-w-0">
            <p
              id="routing-detail-title"
              className="text-slate-100 truncate text-sm font-semibold"
            >
              {fromEntity.name.trim()} → {toEntity.name.trim()}
            </p>
            <p className="text-slate-500 text-[11px]">
              {countryFlag(fromEntity.country)} {fromEntity.country} →{" "}
              {countryFlag(toEntity.country)} {toEntity.country}
              {meta ? ` · ${meta.label}` : ""}
            </p>
          </div>
        </div>

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
            <p className="font-mono text-sm font-semibold text-[#c4a574]">
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

        {obligation.amount > 0 && (
          <p className="text-slate-500 mb-4 text-[12px]">
            {obligation.amount.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}{" "}
            {obligation.settlementCurrency}
            {" → "}${obligation.amountUsd.toFixed(2)} USD
            {obligation.settlementCurrency !== "USD" && (
              <span>
                {" · "}1 {obligation.settlementCurrency} = $
                {(obligation.amountUsd / obligation.amount).toFixed(4)}
              </span>
            )}
            {(obligation.feeUsd ?? 0) > 0 && (
              <span>
                {" · "}fee ${obligation.feeUsd!.toFixed(2)}
              </span>
            )}
          </p>
        )}

        <div className="bg-black/25 border-white/[0.04] mb-4 rounded-lg border px-3 py-2.5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-slate-500 text-[10px] font-semibold tracking-wider uppercase">
              Send instructions
            </p>
            <button
              type="button"
              onClick={() => void copySlip()}
              className="text-slate-400 hover:text-slate-100 text-[11px] font-medium"
            >
              {copyFailed ? "Copy failed" : copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-slate-300 text-xs leading-relaxed">{slip.text}</p>
        </div>

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

        {obligation.considered && obligation.considered.length > 0 && (
          <div className="mb-4">
            <p className="text-slate-500 mb-2 text-[10px] font-semibold tracking-wider uppercase">
              Try another rail
            </p>
            <div className="space-y-1.5">
              {obligation.considered.map((c, i) => {
                const m = RAIL_META[c.type];
                const eligible = c.eligible !== false;
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${
                      c.chosen
                        ? "border-[var(--text)]/25 bg-[var(--text)]/5"
                        : "border-white/[0.06] bg-white/[0.02]"
                    }`}
                  >
                    <span className={m?.text ?? "text-slate-400"}>
                      <RailIcon type={c.type} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-xs font-semibold ${c.chosen ? "text-slate-100" : "text-slate-300"}`}
                      >
                        {c.railName}
                        {c.chosen && (
                          <span className="text-slate-500 ml-1.5 text-[9px] tracking-wide uppercase">
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
                      {canEdit && !c.chosen && eligible && onOverride && (
                        <button
                          type="button"
                          className="text-slate-200 mt-1 text-[10px] font-medium underline underline-offset-2"
                          onClick={() => onOverride(c.railName)}
                        >
                          Use this
                        </button>
                      )}
                      {canEdit && !c.chosen && !eligible && onLink && (
                        <button
                          type="button"
                          className="mt-1 text-[10px] font-medium text-[#c4a574] underline underline-offset-2"
                          onClick={onLink}
                        >
                          Link account
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
