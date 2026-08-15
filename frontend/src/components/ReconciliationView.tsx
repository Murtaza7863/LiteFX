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

const STATUS_META: Record<string, { label: string; cls: string; icon: ComponentType<{ className?: string }> }> = {
  reconciled: { label: "Reconciled", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25", icon: IconCheck },
  mismatch: { label: "Mismatch", cls: "bg-red-500/15 text-red-300 border-red-500/25", icon: IconAlertTriangle },
  unmatched: { label: "Unmatched", cls: "bg-slate-500/15 text-slate-400 border-slate-500/20", icon: IconMinus },
};

export function ReconciliationView({ results, vendorSummary, ledger = [], entityName }: Props) {
  if (results.length === 0) {
    return (
      <div className="glass rounded-2xl p-8 text-center text-slate-500 text-sm">
        Run reconciliation to see invoice matching.
      </div>
    );
  }

  return (
    <div className="space-y-5">
    <div className="grid lg:grid-cols-2 gap-5">
      {/* Vendor summary */}
      <div className="glass rounded-2xl overflow-hidden animate-fade-in-up">
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <h4 className="section-title">Net Settlement Due</h4>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2.5 font-medium">Vendor</th>
              <th className="px-4 py-2.5 font-medium text-right">Invoice</th>
              <th className="px-4 py-2.5 font-medium text-right">Settled</th>
              <th className="px-4 py-2.5 font-medium text-right">Pending</th>
            </tr>
          </thead>
          <tbody>
            {vendorSummary.map((v) => (
              <tr key={v.vendorId} className="border-t border-white/[0.04]">
                <td className="px-4 py-3 text-[13px] text-slate-300">{v.vendorName}</td>
                <td className="px-4 py-3 text-right font-mono text-[13px] text-slate-400">${v.invoiceAmountUsd.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-mono text-[13px] text-emerald-400">${v.settledUsd.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-mono text-[13px] text-amber-400">${v.pendingUsd.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invoice matching */}
      <div className="space-y-2.5">
        {results.map((r) => {
          const meta = STATUS_META[r.status] ?? STATUS_META.unmatched;
          const Icon = meta.icon;
          return (
            <div
              key={r.invoice.id}
              className="glass rounded-xl p-3.5 animate-fade-in-up flex items-start gap-3"
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full shrink-0 ${meta.cls} border`}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-slate-200 truncate">
                    {r.invoice.bookingRef} <span className="text-slate-500 font-normal">· {r.invoice.vendorName}</span>
                  </p>
                  <span className={`chip border ${meta.cls}`}>{meta.label}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{r.note}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>

    {ledger.length > 0 && (
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <h4 className="section-title">Settlement Ledger</h4>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {ledger.map((l) => (
            <div key={l.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-[13px]">
              <span className="text-slate-300 truncate">
                {entityName ? entityName(l.from) : l.from} → {entityName ? entityName(l.to) : l.to}
              </span>
              <span className="text-slate-500 text-xs capitalize hidden sm:inline">{l.rail.replace("_", " ")}</span>
              <span className="font-mono text-slate-200 tnum">${l.amountUsd.toFixed(2)}</span>
              <span className={`chip border ${l.status === "claimed" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" : "bg-cyan-500/15 text-cyan-300 border-cyan-500/25"}`}>{l.status}</span>
            </div>
          ))}
        </div>
      </div>
    )}
    </div>
  );
}
