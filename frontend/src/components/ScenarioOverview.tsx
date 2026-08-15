import type { Entity, Expense } from "../api/client";
import { Avatar } from "./Avatar";
import { IconX } from "./icons";
import { COUNTRY_FLAGS, COUNTRY_NAMES } from "../lib/theme";

// ──────────────────────────────────────────────
// Scenario overview: traveler cards + expense ledger.
// ──────────────────────────────────────────────

interface Props {
  entities: Entity[];
  expenses: Expense[];
  onDeleteTraveler?: (id: string) => void;
  onDeleteExpense?: (id: string) => void;
}

export function ScenarioOverview({ entities, expenses, onDeleteTraveler, onDeleteExpense }: Props) {
  return (
    <div className="space-y-5">
      {/* Travelers */}
      <div>
        <h3 className="section-title mb-3">
          Travelers <span className="text-slate-600 normal-case font-normal">· {entities.length}</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {entities.map((e) => {
            const hasAccount = e.linkedRailAliases.length > 0;
            return (
              <div key={e.id} className="glass rounded-xl p-3 flex items-center gap-3 animate-fade-in-up">
                <Avatar id={e.id} name={e.name} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-slate-200 truncate">{e.name.trim()}</p>
                    {!hasAccount && (
                      <span
                        className="chip bg-amber-500/15 border border-amber-500/30 text-amber-300 !px-1.5 !py-0 !text-[9px]"
                        title="No linked account — will receive via claim link"
                      >
                        no account
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {COUNTRY_FLAGS[e.country]} {COUNTRY_NAMES[e.country] ?? e.country}
                    {hasAccount && (
                      <span className="text-slate-600">
                        {" · "}
                        {e.linkedRailAliases.map((a) => a.railType).join(", ")} ({e.country})
                      </span>
                    )}
                  </p>
                </div>
                {onDeleteTraveler && (
                  <button
                    onClick={() => onDeleteTraveler(e.id)}
                    className="shrink-0 h-7 w-7 flex items-center justify-center rounded-full text-slate-600 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                    title="Remove traveler"
                  >
                    <IconX className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Expenses */}
      <div>
        <h3 className="section-title mb-3">
          Shared Expenses <span className="text-slate-600 normal-case font-normal">· {expenses.length}</span>
        </h3>
        <div className="glass rounded-xl overflow-hidden">
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#0b1120]/90 backdrop-blur">
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-3.5 py-2.5 font-medium">Expense</th>
                  <th className="px-3.5 py-2.5 font-medium">Paid by</th>
                  <th className="px-3.5 py-2.5 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => {
                  const payer = entities.find((e) => e.id === exp.payerId);
                  return (
                    <tr key={exp.id} className="border-t border-white/[0.04] hover:bg-white/[0.03] transition-colors">
                      <td className="px-3.5 py-2.5">
                        <p className="text-[13px] text-slate-300 leading-tight">{exp.description}</p>
                        <p className="text-[11px] text-slate-600">split {exp.participantIds.length} ways</p>
                      </td>
                      <td className="px-3.5 py-2.5">
                        {payer && (
                          <div className="flex items-center gap-2">
                            <Avatar id={payer.id} name={payer.name} size={22} />
                            <span className="text-xs text-slate-400">{payer.name.trim().split(" ")[0]}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono text-[13px] text-slate-200 whitespace-nowrap">
                        {exp.amount.toLocaleString()} <span className="text-slate-500">{exp.currency}</span>
                      </td>
                      {onDeleteExpense && (
                        <td className="pr-3 py-2.5 text-right">
                          <button
                            onClick={() => onDeleteExpense(exp.id)}
                            className="h-6 w-6 inline-flex items-center justify-center rounded-full text-slate-600 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                            title="Remove expense"
                          >
                            <IconX className="h-3 w-3" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
