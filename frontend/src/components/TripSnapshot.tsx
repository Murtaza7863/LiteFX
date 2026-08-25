import type { Entity, Expense } from "../api/client";

import { tripSnapshot } from "../lib/settlementRecap";
import { countryFlag } from "../lib/theme";

export function TripSnapshot({
  name,
  entities,
  expenses,
}: {
  name: string;
  entities: Entity[];
  expenses: Expense[];
}) {
  const snap = tripSnapshot(entities, expenses);
  if (snap.travelerCount === 0) return null;
  return (
    <section className="animate-fade-in-up">
      <p className="section-title">This trip</p>
      <h1 className="text-slate-50 font-display mt-1 text-[1.7rem] leading-[1.15] font-semibold tracking-[-0.03em] sm:text-[2rem]">
        {name}
      </h1>
      <p className="text-slate-400 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-6">
        <span>
          {snap.travelerCount} traveler{snap.travelerCount === 1 ? "" : "s"}
        </span>
        <span className="text-slate-600">·</span>
        <span className="flex flex-wrap items-center gap-1.5">
          {snap.countries.map((code) => (
            <span key={code} className="whitespace-nowrap">
              {countryFlag(code)} {code}
            </span>
          ))}
        </span>
        {snap.currencies.length > 0 && (
          <>
            <span className="text-slate-600">·</span>
            <span className="tnum">{snap.currencies.join(" · ")}</span>
          </>
        )}
        {snap.expenseCount > 0 && (
          <>
            <span className="text-slate-600">·</span>
            <span>
              {snap.expenseCount} expense{snap.expenseCount === 1 ? "" : "s"}
            </span>
          </>
        )}
      </p>
    </section>
  );
}
