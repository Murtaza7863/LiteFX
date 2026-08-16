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
          className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-2.5 text-[13px] sm:grid-cols-[1fr_auto_auto]"
        >
          <div className="min-w-0">
            <p className="text-slate-300 truncate">
              {entityName(l.from)} → {entityName(l.to)}
            </p>
            <p className="text-slate-500 mt-0.5 text-[10px]">
              <span className="capitalize">{l.rail.replace("_", " ")}</span>
              {" · "}
              {new Date(l.timestamp).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              {" · "}LiteFX {l.obligationId}
            </p>
          </div>
          <div className="text-right">
            <p className="text-slate-200 tnum font-mono">
              {l.amount.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}{" "}
              {l.currency}
            </p>
            <p className="text-slate-500 tnum font-mono text-[10px]">
              ${l.amountUsd.toFixed(2)} USD
            </p>
          </div>
          <span
            className={`chip col-span-2 justify-self-end border sm:col-span-1 ${
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
