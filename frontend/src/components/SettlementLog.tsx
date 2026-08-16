import type { LedgerEntry } from "../api/client";

export function SettlementLog({
  ledger,
  entityName,
}: {
  ledger: LedgerEntry[];
  entityName: (id: string) => string;
}) {
  if (ledger.length === 0) return null;
  return (
    <div className="divide-white/[0.04] divide-y">
      {ledger.map((l) => (
        <div
          key={l.id}
          className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-2.5 text-[13px] sm:grid-cols-[1fr_auto_auto_auto]"
        >
          <span className="text-slate-300 min-w-0 truncate">
            {entityName(l.from)} → {entityName(l.to)}
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
  );
}
