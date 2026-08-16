import type { ComponentType } from "react";

import type { ReconciliationResult, LedgerEntry } from "../api/client";

import { IconCheck, IconAlertTriangle, IconMinus } from "./icons";

// ──────────────────────────────────────────────
// B2B reconciliation: match settlements against
// vendor invoices, flag mismatches, and show a
// per-vendor "due this week" summary.
// ──────────────────────────────────────────────

interface Props {
  results: ReconciliationResult[];
  vendorSummary: {
    vendorId: string;
    vendorName: string;
    invoiceAmountUsd: number;
    settledUsd: number;
    pendingUsd: number;
  }[];
  ledger?: LedgerEntry[];
  entityName?: (id: string) => string;
}

const STATUS_META: Record<
  string,
  { label: string; cls: string; icon: ComponentType<{ className?: string }> }
> = {
  reconciled: {
    label: "Reconciled",
    cls: "bg-[#9aaa8c]/15 text-[#9aaa8c] border-[#9aaa8c]/25",
    icon: IconCheck,
  },
  mismatch: {
    label: "Mismatch",
    cls: "bg-[#c48878]/15 text-[#c48878] border-[#c48878]/25",
    icon: IconAlertTriangle,
  },
  unmatched: {
    label: "Unmatched",
    cls: "bg-slate-500/15 text-slate-400 border-slate-500/20",
    icon: IconMinus,
  },
};

export function ReconciliationView({
  results,
  vendorSummary,
  ledger = [],
  entityName,
}: Props) {
  if (results.length === 0) {
    return (
      <div className="glass text-slate-500 rounded-xl p-6 text-center text-sm">
        Run reconciliation to see invoice matching.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Vendor summary */}
        <div className="bg-black/20 border-white/[0.06] animate-fade-in-up overflow-hidden rounded-xl border">
          <div className="border-white/[0.06] border-b px-4 py-3">
            <h4 className="section-title">Net Settlement Due</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-left text-[11px] tracking-wider uppercase">
                  <th className="px-4 py-2.5 font-medium">Vendor</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    Invoice
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    Settled
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    Pending
                  </th>
                </tr>
              </thead>
              <tbody>
                {vendorSummary.map((v) => (
                  <tr key={v.vendorId} className="border-white/[0.04] border-t">
                    <td className="text-slate-300 px-4 py-3 text-[13px]">
                      {v.vendorName}
                    </td>
                    <td className="text-slate-400 px-4 py-3 text-right font-mono text-[13px]">
                      ${v.invoiceAmountUsd.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[13px] text-[#9aaa8c]">
                      ${v.settledUsd.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[13px] text-[#c4a574]">
                      ${v.pendingUsd.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Invoice matching */}
        <div className="space-y-2.5">
          {results.map((r) => {
            const meta = STATUS_META[r.status] ?? STATUS_META.unmatched;
            const Icon = meta.icon;
            return (
              <div
                key={r.invoice.id}
                className="bg-black/20 border-white/[0.06] animate-fade-in-up flex items-start gap-3 rounded-xl border p-3"
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.cls} border`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-slate-200 truncate text-[13px] font-semibold">
                      {r.invoice.bookingRef}{" "}
                      <span className="text-slate-500 font-normal">
                        · {r.invoice.vendorName}
                      </span>
                    </p>
                    <span className={`chip border ${meta.cls}`}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="text-slate-500 mt-1 text-xs leading-relaxed">
                    {r.note}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {ledger.length > 0 && (
        <div className="bg-black/20 border-white/[0.06] overflow-hidden rounded-xl border">
          <div className="border-white/[0.06] border-b px-4 py-3">
            <h4 className="section-title">Settlement Ledger</h4>
          </div>
          <div className="divide-white/[0.04] divide-y">
            {ledger.map((l) => (
              <div
                key={l.id}
                className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px] sm:grid-cols-[1fr_auto_auto_auto]"
              >
                <span className="text-slate-300 min-w-0 truncate">
                  {entityName ? entityName(l.from) : l.from} →{" "}
                  {entityName ? entityName(l.to) : l.to}
                </span>
                <span className="text-slate-500 hidden text-xs capitalize sm:inline">
                  {l.rail.replace("_", " ")}
                </span>
                <span className="text-slate-200 tnum font-mono">
                  ${l.amountUsd.toFixed(2)}
                </span>
                <span
                  className={`chip justify-self-end border ${
                    l.status === "claimed"
                      ? "border-[#9aaa8c]/25 bg-[#9aaa8c]/15 text-[#9aaa8c]"
                      : "bg-white/[0.06] border-white/[0.1] text-slate-300"
                  }`}
                >
                  {l.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
