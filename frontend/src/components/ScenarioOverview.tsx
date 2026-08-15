import type { Entity, Expense } from "../api/client";

// ──────────────────────────────────────────────
// Scenario overview: entity cards + expense list.
// ──────────────────────────────────────────────

interface Props {
  entities: Entity[];
  expenses: Expense[];
}

export function ScenarioOverview({ entities, expenses }: Props) {
  return (
    <div className="space-y-4">
      {/* Entities */}
      <div>
        <h3 className="text-sm font-semibold text-slate-400 mb-2 uppercase tracking-wide">
          Travelers ({entities.length})
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {entities.map((e) => {
            const hasAccount = e.linkedRailAliases.length > 0;
            return (
              <div
                key={e.id}
                className={`rounded-lg border p-3 ${hasAccount ? "border-slate-700 bg-slate-900" : "border-amber-700 bg-amber-950/30"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm text-slate-100">{e.name.trim()}</span>
                  <span className="text-xs text-slate-500">{e.country}</span>
                </div>
                <div className="mt-1">
                  {hasAccount ? (
                    <span className="text-xs text-blue-400">
                      {e.linkedRailAliases.map((a) => a.railType).join(", ")}
                    </span>
                  ) : (
                    <span className="text-xs text-amber-500">⚠ No linked account</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Expenses */}
      <div>
        <h3 className="text-sm font-semibold text-slate-400 mb-2 uppercase tracking-wide">
          Shared Expenses ({expenses.length})
        </h3>
        <div className="rounded-lg border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900">
              <tr className="text-left text-xs text-slate-500">
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Payer</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-center">Split</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((exp) => {
                const payer = entities.find((e) => e.id === exp.payerId);
                return (
                  <tr key={exp.id} className="border-t border-slate-800 hover:bg-slate-900/50">
                    <td className="px-3 py-2 text-slate-300">{exp.description}</td>
                    <td className="px-3 py-2 text-slate-400">{payer?.name.trim() ?? "?"}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-300">
                      {exp.amount.toLocaleString()} {exp.currency}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-500">{exp.participantIds.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
