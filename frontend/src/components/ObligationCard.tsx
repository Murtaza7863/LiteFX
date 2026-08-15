import type { Entity, NetObligation, RailType } from "../api/client";

// ──────────────────────────────────────────────
// Per-obligation card showing the chosen rail and
// the routingReason string (surfaced directly in the UI
// so the demo can show *why* each decision was made).
// ──────────────────────────────────────────────

const RAIL_STYLES: Record<RailType, { bg: string; border: string; text: string; label: string }> = {
  local: { bg: "bg-emerald-950", border: "border-emerald-500", text: "text-emerald-400", label: "Local" },
  linked: { bg: "bg-blue-950", border: "border-blue-500", text: "text-blue-400", label: "Linked" },
  claim_link: { bg: "bg-amber-950", border: "border-amber-500", text: "text-amber-400", label: "Claim Link" },
  stable_bridge: { bg: "bg-purple-950", border: "border-purple-500", text: "text-purple-400", label: "Stable Bridge" },
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-slate-700 text-slate-300",
  routed: "bg-blue-900 text-blue-300",
  settled: "bg-emerald-900 text-emerald-300",
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
  const railStyle = rail ? RAIL_STYLES[rail] : null;

  return (
    <div
      className={`rounded-xl border p-4 ${railStyle ? `${railStyle.bg} ${railStyle.border}` : "bg-slate-900 border-slate-700"}`}
    >
      {/* Header: from → to */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-1.5 text-sm">
            <span className="font-semibold text-slate-100">{fromEntity.name.trim()}</span>
            <span className="text-slate-500 text-xs">({fromEntity.country})</span>
            <span className="text-slate-600 mx-1">→</span>
            <span className="font-semibold text-slate-100">{toEntity.name.trim()}</span>
            <span className="text-slate-500 text-xs">({toEntity.country})</span>
          </div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[obligation.status] ?? ""}`}>
          {obligation.status}
        </span>
      </div>

      {/* Amount */}
      <div className="mb-3">
        <span className="text-2xl font-bold text-slate-100">
          {obligation.amount.toLocaleString()} {obligation.settlementCurrency}
        </span>
        <span className="text-sm text-slate-400 ml-2">
          ({obligation.amountUsd.toFixed(2)} USD)
        </span>
      </div>

      {/* Rail badge */}
      {rail && railStyle && (
        <div className="mb-3 flex items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${railStyle.text} ${railStyle.bg} border ${railStyle.border}`}>
            {railStyle.label}
          </span>
        </div>
      )}

      {/* Routing reason */}
      {obligation.routingReason && (
        <div className="mb-3 rounded-lg bg-slate-950/50 p-2.5">
          <p className="text-xs text-slate-400 leading-relaxed">
            <span className="text-slate-500 font-medium">Routing reason: </span>
            {obligation.routingReason}
          </p>
        </div>
      )}

      {/* Compliance flags */}
      {obligation.complianceFlags && obligation.complianceFlags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {obligation.complianceFlags.map((f, i) => (
            <span
              key={i}
              className="rounded bg-red-950 border border-red-700 px-2 py-0.5 text-xs text-red-400"
              title={f.message}
            >
              ⚠ {f.type === "limit_exceeded" ? "Limit exceeded" : "Frequency anomaly"}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {obligation.status === "routed" && (
          <button
            onClick={() => onSettle(obligation.id)}
            className="flex-1 rounded-lg bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm font-medium text-slate-100 transition-colors"
          >
            {rail === "claim_link" ? "Generate Claim Link" : "Settle (mock)"}
          </button>
        )}
        {obligation.status === "settled" && obligation.claimToken && (
          <button
            onClick={() => onOpenClaim(obligation.claimToken!)}
            className="flex-1 rounded-lg bg-amber-600 hover:bg-amber-500 px-3 py-1.5 text-sm font-medium text-white transition-colors"
          >
            Open Claim Link →
          </button>
        )}
        {obligation.status === "settled" && !obligation.claimToken && (
          <span className="flex-1 text-center text-sm text-emerald-400 py-1.5">
            ✓ Settled
          </span>
        )}
        {obligation.status === "pending" && (
          <span className="flex-1 text-center text-sm text-slate-500 py-1.5">
            Route first
          </span>
        )}
      </div>
    </div>
  );
}
