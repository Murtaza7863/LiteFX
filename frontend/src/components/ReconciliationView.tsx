import type { ReconciliationResult } from "../api/client";

// ──────────────────────────────────────────────
// B2B reconciliation view: match settlement amounts
// against vendor invoices; flag mismatches.
// ──────────────────────────────────────────────

interface Props {
  results: ReconciliationResult[];
  vendorSummary: { vendorId: string; vendorName: string; invoiceAmountUsd: number; settledUsd: number; pendingUsd: number }[];
}

const STATUS_STYLES: Record<string, string> = {
  reconciled: "bg-emerald-900 text-emerald-300 border-emerald-700",
  mismatch: "bg-red-900 text-red-300 border-red-700",
  unmatched: "bg-slate-700 text-slate-300 border-slate-600",
};

export function ReconciliationView({ results, vendorSummary }: Props) {
  if (results.length === 0) {
    return (
      <p className="text-slate-500 text-sm py-4 text-center">
        Run reconciliation to see invoice matching.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Vendor summary */}
      <div className="rounded-lg border border-slate-800 overflow-hidden">
        <div className="bg-slate-900 px-3 py-2">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Net Settlement Due This Week
          </h4>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50">
            <tr className="text-left text-xs text-slate-500">
              <th className="px-3 py-2">Vendor</th>
              <th className="px-3 py-2 text-right">Invoice</th>
              <th className="px-3 py-2 text-right">Settled</th>
              <th className="px-3 py-2 text-right">Pending</th>
            </tr>
          </thead>
          <tbody>
            {vendorSummary.map((v) => (
              <tr key={v.vendorId} className="border-t border-slate-800">
                <td className="px-3 py-2 text-slate-300">{v.vendorName}</td>
                <td className="px-3 py-2 text-right font-mono text-slate-400">${v.invoiceAmountUsd.toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-mono text-emerald-400">${v.settledUsd.toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-mono text-amber-400">${v.pendingUsd.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invoice matching results */}
      <div className="space-y-2">
        {results.map((r) => (
          <div
            key={r.invoice.id}
            className={`rounded-lg border p-3 ${STATUS_STYLES[r.status] ?? "border-slate-700 bg-slate-900"}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-sm text-slate-100">
                {r.invoice.bookingRef} — {r.invoice.vendorName}
              </span>
              <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[r.status]}`}>
                {r.status}
              </span>
            </div>
            <p className="text-xs text-slate-400">{r.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
