import { useState, useEffect, useRef } from "react";

import type { Entity } from "../api/client";

import { client } from "../api/client";
import {
  COUNTRIES,
  CURRENCY_OPTIONS,
  flagFromCode,
  railsFor,
  primaryRail,
} from "../lib/countries";
import { IconPlus } from "./icons";

const inputCls =
  "w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-400/50";

interface Props {
  entities: Entity[];
  expenseCount: number;
  onAdded: (msg: string) => void;
  onClear: () => void;
  onLoadSample: () => void;
  travelerSignal?: number;
}

export function AddDataForms({
  entities,
  expenseCount,
  onAdded,
  onClear,
  onLoadSample,
  travelerSignal = 0,
}: Props) {
  const [open, setOpen] = useState<null | "traveler" | "expense">(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (travelerSignal > 0) {
      setOpen("traveler");
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [travelerSignal]);

  const [tName, setTName] = useState("");
  const [tCountry, setTCountry] = useState("SG");
  const [tContact, setTContact] = useState("");
  const [tHasAccount, setTHasAccount] = useState(true);
  const [tRail, setTRail] = useState(primaryRail("SG"));

  const [eDesc, setEDesc] = useState("");
  const [eAmount, setEAmount] = useState("");
  const [eCurrency, setECurrency] = useState("USD");
  const [ePayer, setEPayer] = useState("");
  const [eAll, setEAll] = useState(true);
  const [eParticipants, setEParticipants] = useState<string[]>([]);
  const [eSplitMode, setESplitMode] = useState<"equal" | "percent" | "amount">(
    "equal",
  );
  const [eParts, setEParts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submitTraveler = async () => {
    if (!tName.trim()) return;
    setBusy(true);
    try {
      await client.addEntity({
        name: tName.trim(),
        country: tCountry,
        railType: tHasAccount ? tRail : undefined,
        contact: tContact.trim()
          ? tContact.includes("@")
            ? { type: "email", value: tContact.trim() }
            : { type: "phone", value: tContact.trim() }
          : undefined,
      });
      setTName("");
      setTContact("");
      onAdded(`Added traveler ${tName.trim()}`);
      setOpen(null);
    } finally {
      setBusy(false);
    }
  };

  const submitExpense = async () => {
    const amt = parseFloat(eAmount);
    if (!ePayer || !(amt > 0)) return;
    setBusy(true);
    try {
      const partList = eAll ? entities.map((e) => e.id) : eParticipants;
      if (!eAll && partList.length === 0) return;
      const parts: Record<string, number> = {};
      if (eSplitMode !== "equal") {
        for (const pid of partList) {
          const v = parseFloat(eParts[pid] ?? "");
          if (v > 0) parts[pid] = v;
        }
      }
      await client.addExpense({
        payerId: ePayer,
        participantIds: partList,
        amount: amt,
        currency: eCurrency,
        description: eDesc.trim() || "Custom expense",
        split: eSplitMode !== "equal" ? { mode: eSplitMode, parts } : undefined,
      });
      setEDesc("");
      setEAmount("");
      setEParts({});
      setESplitMode("equal");
      onAdded("Added expense — debts recomputed");
      setOpen(null);
    } finally {
      setBusy(false);
    }
  };

  const partEntities = eAll
    ? entities
    : entities.filter((en) => eParticipants.includes(en.id));

  return (
    <div ref={rootRef} className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-slate-100 text-base font-semibold">Trip</h2>
          <p className="text-slate-500 mt-0.5 text-xs">
            {entities.length} traveler{entities.length === 1 ? "" : "s"} ·{" "}
            {expenseCount} expense{expenseCount === 1 ? "" : "s"}
          </p>
          <div className="mt-1.5 flex gap-3">
            <button
              type="button"
              onClick={onClear}
              className="text-slate-500 hover:text-red-300 text-[11px] underline-offset-2 transition-colors hover:underline"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={onLoadSample}
              className="text-slate-500 hover:text-cyan-300 text-[11px] underline-offset-2 transition-colors hover:underline"
            >
              Load sample
            </button>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setOpen(open === "traveler" ? null : "traveler")}
            className={`btn-ghost !px-3 !py-1.5 text-xs ${
              open === "traveler" ? "bg-white/[0.08]" : ""
            }`}
          >
            <IconPlus className="h-3.5 w-3.5" /> Traveler
          </button>
          <button
            type="button"
            onClick={() => setOpen(open === "expense" ? null : "expense")}
            disabled={entities.length === 0}
            className={`btn-ghost !px-3 !py-1.5 text-xs ${
              open === "expense" ? "bg-white/[0.08]" : ""
            }`}
          >
            <IconPlus className="h-3.5 w-3.5" /> Expense
          </button>
        </div>
      </div>

      {open === "traveler" && (
        <div className="bg-white/[0.03] border-white/[0.06] animate-fade-in grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
          <input
            className={inputCls}
            placeholder="Name"
            value={tName}
            onChange={(e) => setTName(e.target.value)}
          />
          <select
            className={inputCls}
            value={tCountry}
            onChange={(e) => {
              setTCountry(e.target.value);
              setTRail(primaryRail(e.target.value));
            }}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code} className="bg-slate-900">
                {flagFromCode(c.code)} {c.name} ({c.code})
              </option>
            ))}
          </select>
          <input
            className={`${inputCls} sm:col-span-2`}
            placeholder="Phone or email (for claim links)"
            value={tContact}
            onChange={(e) => setTContact(e.target.value)}
          />
          <label className="text-slate-300 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={tHasAccount}
              onChange={(e) => setTHasAccount(e.target.checked)}
              className="accent-cyan-400"
            />
            Has a linked account
          </label>
          {tHasAccount ? (
            <select
              className={inputCls}
              value={tRail}
              onChange={(e) => setTRail(e.target.value)}
            >
              {railsFor(tCountry).map((r) => (
                <option key={r} value={r} className="bg-slate-900">
                  {r} ({tCountry})
                </option>
              ))}
            </select>
          ) : (
            <div className="hidden sm:block" />
          )}
          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={submitTraveler}
              disabled={busy || !tName.trim()}
              className="btn-primary w-full"
            >
              Add traveler
            </button>
          </div>
        </div>
      )}

      {open === "expense" && (
        <div className="bg-white/[0.03] border-white/[0.06] animate-fade-in grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
          <input
            className={inputCls}
            placeholder="Description (e.g. Dinner)"
            value={eDesc}
            onChange={(e) => setEDesc(e.target.value)}
          />
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="Amount"
              type="number"
              min="0"
              value={eAmount}
              onChange={(e) => setEAmount(e.target.value)}
            />
            <select
              className={`${inputCls} !w-24 shrink-0`}
              value={eCurrency}
              onChange={(e) => setECurrency(e.target.value)}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c} className="bg-slate-900">
                  {c}
                </option>
              ))}
            </select>
          </div>
          <select
            className={inputCls}
            value={ePayer}
            onChange={(e) => setEPayer(e.target.value)}
          >
            <option value="" className="bg-slate-900">
              Paid by…
            </option>
            {entities.map((en) => (
              <option key={en.id} value={en.id} className="bg-slate-900">
                {en.name.trim()}
              </option>
            ))}
          </select>
          <label className="text-slate-300 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={eAll}
              onChange={(e) => setEAll(e.target.checked)}
              className="accent-cyan-400"
            />
            Split among everyone
          </label>
          {!eAll && (
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              {entities.map((en) => {
                const on = eParticipants.includes(en.id);
                return (
                  <button
                    type="button"
                    key={en.id}
                    onClick={() =>
                      setEParticipants((p) =>
                        on ? p.filter((x) => x !== en.id) : [...p, en.id],
                      )
                    }
                    className={`chip border transition-colors ${
                      on
                        ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-200"
                        : "bg-white/[0.03] border-white/[0.08] text-slate-400"
                    }`}
                  >
                    {en.name.trim().split(" ")[0]}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2 sm:col-span-2">
            <span className="text-slate-500 shrink-0 text-xs">Split</span>
            <select
              className={inputCls}
              value={eSplitMode}
              onChange={(e) =>
                setESplitMode(e.target.value as "equal" | "percent" | "amount")
              }
            >
              <option value="equal" className="bg-slate-900">
                Equally
              </option>
              <option value="percent" className="bg-slate-900">
                By percentage
              </option>
              <option value="amount" className="bg-slate-900">
                By exact amount
              </option>
            </select>
          </div>
          {eSplitMode !== "equal" && (
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
              {partEntities.map((en) => (
                <div key={en.id} className="flex min-w-0 items-center gap-2">
                  <span className="text-slate-400 w-20 shrink-0 truncate text-xs">
                    {en.name.trim().split(" ")[0]}
                  </span>
                  <input
                    className={inputCls}
                    type="number"
                    min="0"
                    placeholder={eSplitMode === "percent" ? "%" : eCurrency}
                    value={eParts[en.id] ?? ""}
                    onChange={(e) =>
                      setEParts((p) => ({ ...p, [en.id]: e.target.value }))
                    }
                  />
                </div>
              ))}
              <p className="text-slate-500 text-[11px] sm:col-span-2">
                {eSplitMode === "percent"
                  ? "Unassigned % goes to the payer."
                  : "Unassigned amount goes to the payer."}
              </p>
            </div>
          )}

          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={submitExpense}
              disabled={
                busy ||
                !ePayer ||
                !(parseFloat(eAmount) > 0) ||
                (!eAll && eParticipants.length === 0)
              }
              className="btn-primary w-full"
            >
              Add expense
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
