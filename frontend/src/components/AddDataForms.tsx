import { useState, useEffect } from "react";
import type { Entity } from "../api/client";
import { client } from "../api/client";
import { IconPlus } from "./icons";
import { COUNTRIES, CURRENCY_OPTIONS, flagFromCode, railsFor, primaryRail } from "../lib/countries";

// ──────────────────────────────────────────────
// Practical data entry: add your own travelers and
// expenses so the engine works on real input, not a
// canned scenario.
// ──────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-400/50";

interface Props {
  entities: Entity[];
  onAdded: (msg: string) => void;
  onClear: () => void;
  onLoadSample: () => void;
  travelerSignal?: number;
}

export function AddDataForms({ entities, onAdded, onClear, onLoadSample, travelerSignal = 0 }: Props) {
  const [open, setOpen] = useState<null | "traveler" | "expense">(null);

  useEffect(() => {
    if (travelerSignal > 0) setOpen("traveler");
  }, [travelerSignal]);

  // traveler form
  const [tName, setTName] = useState("");
  const [tCountry, setTCountry] = useState("SG");
  const [tHasAccount, setTHasAccount] = useState(true);
  const [tRail, setTRail] = useState("paynow");

  // expense form
  const [eDesc, setEDesc] = useState("");
  const [eAmount, setEAmount] = useState("");
  const [eCurrency, setECurrency] = useState("USD");
  const [ePayer, setEPayer] = useState("");
  const [eAll, setEAll] = useState(true);
  const [eParticipants, setEParticipants] = useState<string[]>([]);
  const [eSplitMode, setESplitMode] = useState<"equal" | "percent" | "amount">("equal");
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
      });
      setTName("");
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

  const partEntities = eAll ? entities : entities.filter((en) => eParticipants.includes(en.id));

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h3 className="section-title">Your data</h3>
          <button onClick={onClear} className="text-[11px] text-slate-500 hover:text-red-300 underline-offset-2 hover:underline transition-colors">
            Clear all
          </button>
          <button onClick={onLoadSample} className="text-[11px] text-slate-500 hover:text-cyan-300 underline-offset-2 hover:underline transition-colors">
            Load sample
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setOpen(open === "traveler" ? null : "traveler")} className="btn-ghost !px-3 !py-1.5 text-xs">
            <IconPlus className="h-3.5 w-3.5" /> Traveler
          </button>
          <button onClick={() => setOpen(open === "expense" ? null : "expense")} className="btn-ghost !px-3 !py-1.5 text-xs">
            <IconPlus className="h-3.5 w-3.5" /> Expense
          </button>
        </div>
      </div>

      {open === "traveler" && (
        <div className="grid sm:grid-cols-2 gap-3 animate-fade-in">
          <input className={inputCls} placeholder="Name" value={tName} onChange={(e) => setTName(e.target.value)} />
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
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={tHasAccount} onChange={(e) => setTHasAccount(e.target.checked)} className="accent-cyan-400" />
            Has a linked account
          </label>
          {tHasAccount && (
            <select className={inputCls} value={tRail} onChange={(e) => setTRail(e.target.value)}>
              {railsFor(tCountry).map((r) => (
                <option key={r} value={r} className="bg-slate-900">
                  {r} ({tCountry})
                </option>
              ))}
            </select>
          )}
          <div className="sm:col-span-2">
            <button onClick={submitTraveler} disabled={busy || !tName.trim()} className="btn-primary w-full">
              Add traveler
            </button>
          </div>
        </div>
      )}

      {open === "expense" && (
        <div className="grid sm:grid-cols-2 gap-3 animate-fade-in">
          <input className={inputCls} placeholder="Description (e.g. Dinner)" value={eDesc} onChange={(e) => setEDesc(e.target.value)} />
          <div className="flex gap-2">
            <input className={inputCls} placeholder="Amount" type="number" min="0" value={eAmount} onChange={(e) => setEAmount(e.target.value)} />
            <select className={`${inputCls} !w-24`} value={eCurrency} onChange={(e) => setECurrency(e.target.value)}>
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c} className="bg-slate-900">{c}</option>
              ))}
            </select>
          </div>
          <select className={inputCls} value={ePayer} onChange={(e) => setEPayer(e.target.value)}>
            <option value="" className="bg-slate-900">Paid by…</option>
            {entities.map((en) => (
              <option key={en.id} value={en.id} className="bg-slate-900">{en.name.trim()}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={eAll} onChange={(e) => setEAll(e.target.checked)} className="accent-cyan-400" />
            Split among everyone
          </label>
          {!eAll && (
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              {entities.map((en) => {
                const on = eParticipants.includes(en.id);
                return (
                  <button
                    key={en.id}
                    onClick={() =>
                      setEParticipants((p) => (on ? p.filter((x) => x !== en.id) : [...p, en.id]))
                    }
                    className={`chip border transition-colors ${
                      on ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-200" : "bg-white/[0.03] border-white/[0.08] text-slate-400"
                    }`}
                  >
                    {en.name.trim().split(" ")[0]}
                  </button>
                );
              })}
            </div>
          )}

          <div className="sm:col-span-2 flex items-center gap-2">
            <span className="text-xs text-slate-500">Split:</span>
            <select
              className={`${inputCls} !w-44`}
              value={eSplitMode}
              onChange={(e) => setESplitMode(e.target.value as "equal" | "percent" | "amount")}
            >
              <option value="equal" className="bg-slate-900">Equally</option>
              <option value="percent" className="bg-slate-900">By percentage</option>
              <option value="amount" className="bg-slate-900">By exact amount</option>
            </select>
          </div>
          {eSplitMode !== "equal" && (
            <div className="sm:col-span-2 grid sm:grid-cols-2 gap-2">
              {partEntities.map((en) => (
                <div key={en.id} className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 w-20 truncate">{en.name.trim().split(" ")[0]}</span>
                  <input
                    className={inputCls}
                    type="number"
                    min="0"
                    placeholder={eSplitMode === "percent" ? "%" : eCurrency}
                    value={eParts[en.id] ?? ""}
                    onChange={(e) => setEParts((p) => ({ ...p, [en.id]: e.target.value }))}
                  />
                </div>
              ))}
              <p className="sm:col-span-2 text-[11px] text-slate-500">
                {eSplitMode === "percent" ? "Unassigned % goes to the payer." : "Unassigned amount goes to the payer."}
              </p>
            </div>
          )}

          <div className="sm:col-span-2">
            <button onClick={submitExpense} disabled={busy || !ePayer || !(parseFloat(eAmount) > 0)} className="btn-primary w-full">
              Add expense
            </button>
          </div>
        </div>
      )}

      {open === null && (
        <p className="text-xs text-slate-500">
          Key in your own travelers and expenses — the engine nets & routes whatever you enter. “Load sample” restores the
          pre-vetted example; “Clear all” starts blank.
        </p>
      )}
    </div>
  );
}
