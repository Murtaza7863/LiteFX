import type {
  DebtEdge,
  Entity,
  Expense,
  FxSnapshot,
  NetObligation,
} from "../api/client";

import { categoryLabel } from "../lib/countries";
import {
  booksCloseUsd,
  bookPositionUsd,
  formatUsd,
  remainingFromObligations,
  runningBalances,
  spendByCategory,
  spendByPerson,
} from "../lib/tripMath";
import { Avatar } from "./Avatar";

export function TripBooks({
  entities,
  expenses,
  debtEdges,
  obligations,
  fx,
}: {
  entities: Entity[];
  expenses: Expense[];
  debtEdges: DebtEdge[];
  obligations: NetObligation[];
  fx?: FxSnapshot;
}) {
  if (expenses.length === 0) return null;
  const rates = fx?.rates;
  const balances = runningBalances(entities, debtEdges);
  const { closed } = booksCloseUsd(balances);
  const paid = spendByPerson(entities, expenses, rates);
  const cats = spendByCategory(expenses, rates);
  const remaining = remainingFromObligations(entities, obligations);
  const netted = obligations.length > 0;
  const totalPaid = paid.reduce((s, p) => s + p.paidUsd, 0);

  return (
    <section className="glass animate-fade-in-up rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="section-title">Trip books</p>
        <p className="text-slate-500 text-[11px]">
          {closed
            ? "IOUs net to $0.00"
            : "IOUs should net to $0.00. Check the amounts"}
          {totalPaid > 0 ? ` · ${formatUsd(totalPaid)} spent` : ""}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-6">
        {balances.map((b) => {
          const rem = remaining.get(b.entityId);
          const shown = bookPositionUsd(b.netUsd, rem, netted);
          const settled = Math.abs(shown) < 0.005;
          const isCreditor = shown > 0.005;
          const stillPay = rem && rem.payUsd > 0.005;
          const stillRecv = rem && rem.receiveUsd > 0.005;
          return (
            <div
              key={b.entityId}
              className="bg-black/25 border-white/[0.05] flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5"
            >
              <Avatar id={b.entityId} name={b.entityName} size={24} />
              <div className="min-w-0">
                <p className="text-slate-200 truncate text-[12px] font-medium">
                  {b.entityName.split(" ")[0]}
                </p>
                <p
                  className={`font-mono text-[11px] ${
                    settled
                      ? "text-slate-500"
                      : isCreditor
                        ? "text-[#9aaa8c]"
                        : "text-[#c48878]"
                  }`}
                >
                  {formatUsd(shown, true)}
                </p>
                {netted && (
                  <p className="text-slate-600 truncate text-[10px]">
                    {stillPay
                      ? `still send ${formatUsd(rem?.payUsd ?? 0)}`
                      : stillRecv
                        ? `still get ${formatUsd(rem?.receiveUsd ?? 0)}`
                        : "cleared"}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {cats.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {cats.map((c) => (
            <span
              key={c.category}
              className="chip bg-white/[0.04] text-slate-400 border-[var(--border)]"
            >
              {categoryLabel(c.category)} {formatUsd(c.usd)}
            </span>
          ))}
        </div>
      )}
      {paid.some((p) => p.paidUsd > 0) && (
        <p className="text-slate-500 text-[11px]">
          Fronted:{" "}
          {paid
            .filter((p) => p.paidUsd > 0.005)
            .map((p) => `${p.entityName.split(" ")[0]} ${formatUsd(p.paidUsd)}`)
            .join(" · ")}
        </p>
      )}
    </section>
  );
}
