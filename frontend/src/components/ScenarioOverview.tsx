import type { Entity, Expense } from "../api/client";

import { categoryLabel } from "../lib/countries";
import { COUNTRY_FLAGS, COUNTRY_NAMES } from "../lib/theme";
import { Avatar } from "./Avatar";
import { IconPencil, IconX } from "./icons";

interface Props {
  entities: Entity[];
  expenses: Expense[];
  onDeleteTraveler?: (id: string) => void;
  onDeleteExpense?: (id: string) => void;
  onEditTraveler?: (id: string) => void;
  onEditExpense?: (id: string) => void;
}

export function ScenarioOverview({
  entities,
  expenses,
  onDeleteTraveler,
  onDeleteExpense,
  onEditTraveler,
  onEditExpense,
}: Props) {
  return (
    <div className="space-y-4">
      {entities.length === 0 ? (
        <p className="text-slate-500 py-8 text-center text-sm">
          Add a traveler to start the trip.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {entities.map((e) => {
            const hasAccount = e.linkedRailAliases.length > 0;
            return (
              <div
                key={e.id}
                className="bg-white/[0.03] border-white/[0.06] animate-fade-in-up flex items-center gap-3 rounded-xl border p-2.5"
              >
                <Avatar id={e.id} name={e.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-slate-200 truncate text-sm font-semibold">
                      {e.name.trim()}
                    </p>
                    {!hasAccount && (
                      <span
                        className="chip bg-amber-500/15 border-amber-500/30 text-amber-300 shrink-0 border !px-1.5 !py-0 !text-[9px]"
                        title="No linked account — will receive via claim link"
                      >
                        no account
                      </span>
                    )}
                  </div>
                  <p className="text-slate-500 truncate text-[11px]">
                    {COUNTRY_FLAGS[e.country]}{" "}
                    {COUNTRY_NAMES[e.country] ?? e.country}
                    {hasAccount && (
                      <span className="text-slate-600">
                        {" · "}
                        {e.linkedRailAliases
                          .map((a) => a.railType)
                          .join(", ")}{" "}
                        ({e.country})
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center">
                  {onEditTraveler && (
                    <button
                      type="button"
                      onClick={() => onEditTraveler(e.id)}
                      className="text-slate-600 hover:text-cyan-300 hover:bg-cyan-500/10 flex h-7 w-7 items-center justify-center rounded-full transition-colors"
                      title="Edit traveler"
                    >
                      <IconPencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {onDeleteTraveler && (
                    <button
                      type="button"
                      onClick={() => onDeleteTraveler(e.id)}
                      className="text-slate-600 hover:text-red-300 hover:bg-red-500/10 flex h-7 w-7 items-center justify-center rounded-full transition-colors"
                      title="Remove traveler"
                    >
                      <IconX className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {expenses.length > 0 && (
        <div className="bg-white/[0.03] border-white/[0.06] overflow-hidden rounded-xl border">
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--header-bg)] backdrop-blur">
                <tr className="text-slate-500 text-left text-[11px] tracking-wider uppercase">
                  <th className="px-3.5 py-2.5 font-medium">Expense</th>
                  <th className="px-3.5 py-2.5 font-medium">Paid by</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">
                    Amount
                  </th>
                  {(onDeleteExpense || onEditExpense) && (
                    <th className="w-16" />
                  )}
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => {
                  const payer = entities.find((e) => e.id === exp.payerId);
                  return (
                    <tr
                      key={exp.id}
                      className="border-white/[0.04] hover:bg-white/[0.03] border-t transition-colors"
                    >
                      <td className="px-3.5 py-2.5">
                        <p className="text-slate-300 text-[13px] leading-tight">
                          {exp.description}
                        </p>
                        <p className="text-slate-600 text-[11px]">
                          {categoryLabel(exp.category)}
                          {" · "}
                          {exp.split && exp.split.mode !== "equal"
                            ? exp.split.mode === "percent"
                              ? `custom % · ${exp.participantIds.length} people`
                              : `custom amounts · ${exp.participantIds.length} people`
                            : `split ${exp.participantIds.length} ways`}
                        </p>
                      </td>
                      <td className="px-3.5 py-2.5">
                        {payer && (
                          <div className="flex items-center gap-2">
                            <Avatar id={payer.id} name={payer.name} size={22} />
                            <span className="text-slate-400 text-xs">
                              {payer.name.trim().split(" ")[0]}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="text-slate-200 px-3.5 py-2.5 text-right font-mono text-[13px] whitespace-nowrap">
                        {exp.amount.toLocaleString()}{" "}
                        <span className="text-slate-500">{exp.currency}</span>
                      </td>
                      {(onDeleteExpense || onEditExpense) && (
                        <td className="py-2.5 pr-2 text-right whitespace-nowrap">
                          {onEditExpense && (
                            <button
                              type="button"
                              onClick={() => onEditExpense(exp.id)}
                              className="text-slate-600 hover:text-cyan-300 hover:bg-cyan-500/10 inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors"
                              title="Edit expense"
                            >
                              <IconPencil className="h-3 w-3" />
                            </button>
                          )}
                          {onDeleteExpense && (
                            <button
                              type="button"
                              onClick={() => onDeleteExpense(exp.id)}
                              className="text-slate-600 hover:text-red-300 hover:bg-red-500/10 inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors"
                              title="Remove expense"
                            >
                              <IconX className="h-3 w-3" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
