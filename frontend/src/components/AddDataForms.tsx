import { useState, useEffect, useRef } from "react";

import type { Entity, Expense } from "../api/client";

import { client } from "../api/client";
import {
  COUNTRIES,
  CURRENCY_OPTIONS,
  EXPENSE_CATEGORIES,
  flagFromCode,
  railsFor,
  primaryRail,
  currencyFor,
} from "../lib/countries";
import { IconPlus, IconDownload, IconMore } from "./icons";

const inputCls = "input-field";

interface Props {
  entities: Entity[];
  expenses: Expense[];
  expenseCount: number;
  onAdded: (msg: string) => void;
  onClear: () => void;
  onLoadSample: () => void;
  travelerSignal?: number;
  editEntity?: Entity | null;
  editExpense?: Expense | null;
  onCancelEdit?: () => void;
}

function downloadCsv(entities: Entity[], expenses: Expense[]) {
  const nameOf = (id: string) =>
    entities.find((e) => e.id === id)?.name.trim() ?? id;
  const rows = [
    [
      "Description",
      "Category",
      "Paid by",
      "Amount",
      "Currency",
      "Participants",
      "Split",
    ],
    ...expenses.map((exp) => [
      exp.description,
      exp.category,
      nameOf(exp.payerId),
      String(exp.amount),
      exp.currency,
      exp.participantIds.map(nameOf).join("; "),
      exp.split?.mode ?? "equal",
    ]),
  ];
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "litefx-trip.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function AddDataForms({
  entities,
  expenses,
  expenseCount,
  onAdded,
  onClear,
  onLoadSample,
  travelerSignal = 0,
  editEntity = null,
  editExpense = null,
  onCancelEdit,
}: Props) {
  const [open, setOpen] = useState<null | "traveler" | "expense">(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  useEffect(() => {
    if (travelerSignal > 0 && !editEntity && !editExpense) {
      setOpen("traveler");
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [travelerSignal, editEntity, editExpense]);

  const [tName, setTName] = useState("");
  const [tCountry, setTCountry] = useState("SG");
  const [tContact, setTContact] = useState("");
  const [tHasAccount, setTHasAccount] = useState(true);
  const [tRail, setTRail] = useState(primaryRail("SG"));

  const [eDesc, setEDesc] = useState("");
  const [eAmount, setEAmount] = useState("");
  const [eCurrency, setECurrency] = useState("USD");
  const [eCategory, setECategory] = useState("general");
  const [ePayer, setEPayer] = useState("");
  const [eAll, setEAll] = useState(true);
  const [eParticipants, setEParticipants] = useState<string[]>([]);
  const [eSplitMode, setESplitMode] = useState<"equal" | "percent" | "amount">(
    "equal",
  );
  const [eParts, setEParts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!editEntity) return;
    setOpen("traveler");
    setTName(editEntity.name);
    setTCountry(editEntity.country);
    setTContact(editEntity.contact.value ?? "");
    setTHasAccount(editEntity.linkedRailAliases.length > 0);
    setTRail(
      editEntity.linkedRailAliases[0]?.railType ||
        primaryRail(editEntity.country),
    );
    setFormError(null);
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editEntity]);

  useEffect(() => {
    if (!editExpense) return;
    setOpen("expense");
    setEDesc(editExpense.description);
    setEAmount(String(editExpense.amount));
    setECurrency(editExpense.currency);
    setECategory(editExpense.category || "general");
    setEPayer(editExpense.payerId);
    const allIds = entities
      .map((e) => e.id)
      .sort()
      .join();
    const partIds = [...editExpense.participantIds].sort().join();
    setEAll(allIds === partIds || editExpense.participantIds.length === 0);
    setEParticipants(editExpense.participantIds);
    setESplitMode(editExpense.split?.mode ?? "equal");
    const parts: Record<string, string> = {};
    for (const [k, v] of Object.entries(editExpense.split?.parts ?? {})) {
      parts[k] = String(v);
    }
    setEParts(parts);
    setFormError(null);
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editExpense, entities]);

  useEffect(() => {
    if (editExpense || !ePayer) return;
    const payer = entities.find((e) => e.id === ePayer);
    if (payer) setECurrency(currencyFor(payer.country));
  }, [ePayer, editExpense, entities]);

  const resetTravelerForm = () => {
    setTName("");
    setTContact("");
    setTHasAccount(true);
  };

  const resetExpenseForm = () => {
    setEDesc("");
    setEAmount("");
    setEParts({});
    setESplitMode("equal");
    setECategory("general");
    setEAll(true);
  };

  const closeForms = () => {
    setOpen(null);
    onCancelEdit?.();
  };

  const submitTraveler = async () => {
    if (!tName.trim()) return;
    setBusy(true);
    setFormError(null);
    try {
      const name = tName.trim();
      const contact = tContact.trim()
        ? tContact.includes("@")
          ? { type: "email" as const, value: tContact.trim() }
          : { type: "phone" as const, value: tContact.trim() }
        : { type: "email" as const, value: "" };
      if (editEntity) {
        await client.updateEntity(editEntity.id, {
          name,
          country: tCountry,
          railType: tHasAccount ? tRail : null,
          contact,
        });
        resetTravelerForm();
        onAdded(`Updated ${name}`);
        closeForms();
      } else {
        await client.addEntity({
          name,
          country: tCountry,
          railType: tHasAccount ? tRail : undefined,
          contact: contact.value ? contact : undefined,
        });
        resetTravelerForm();
        onAdded(`Added traveler ${name}`);
        setOpen(null);
      }
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitExpense = async () => {
    const amt = parseFloat(eAmount);
    if (!ePayer || !(amt > 0)) return;
    setBusy(true);
    setFormError(null);
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
      const payload = {
        payerId: ePayer,
        participantIds: partList,
        amount: amt,
        currency: eCurrency,
        description: eDesc.trim() || "Custom expense",
        category: eCategory,
        split:
          eSplitMode !== "equal"
            ? { mode: eSplitMode, parts }
            : { mode: "equal" as const },
      };
      if (editExpense) {
        await client.updateExpense(editExpense.id, payload);
        resetExpenseForm();
        onAdded("Updated expense — debts recomputed");
        closeForms();
      } else {
        await client.addExpense(payload);
        resetExpenseForm();
        onAdded("Added expense — debts recomputed");
        setOpen(null);
      }
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const partEntities = eAll
    ? entities
    : entities.filter((en) => eParticipants.includes(en.id));

  const editing = !!(editEntity || editExpense);

  return (
    <div ref={rootRef} className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-slate-100 text-base font-semibold">Trip</h2>
          <p className="text-slate-500 mt-0.5 text-xs">
            {entities.length} traveler{entities.length === 1 ? "" : "s"} ·{" "}
            {expenseCount} expense{expenseCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="btn-ghost !px-2 !py-1.5"
              title="Trip actions"
              aria-expanded={menuOpen}
            >
              <IconMore className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="glass-strong animate-scale-in absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl py-1">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onLoadSample();
                  }}
                  className="hover:bg-white/[0.05] text-slate-300 block w-full px-3 py-2 text-left text-sm"
                >
                  Load sample
                </button>
                {expenses.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      downloadCsv(entities, expenses);
                    }}
                    className="hover:bg-white/[0.05] text-slate-300 flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                  >
                    <IconDownload className="h-3.5 w-3.5" />
                    Export CSV
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onClear();
                  }}
                  className="hover:bg-white/[0.05] text-red-300 block w-full px-3 py-2 text-left text-sm"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (open === "traveler" && !editEntity) {
                setOpen(null);
                return;
              }
              onCancelEdit?.();
              setOpen("traveler");
            }}
            className={`btn-ghost !px-3 !py-1.5 text-xs ${
              open === "traveler" ? "bg-white/[0.08]" : ""
            }`}
          >
            <IconPlus className="h-3.5 w-3.5" /> Traveler
          </button>
          <button
            type="button"
            onClick={() => {
              if (entities.length === 0) return;
              if (open === "expense" && !editExpense) {
                setOpen(null);
                return;
              }
              onCancelEdit?.();
              setOpen("expense");
            }}
            disabled={entities.length === 0}
            title={
              entities.length === 0 ? "Add a traveler first" : "Add an expense"
            }
            className={`btn-ghost !px-3 !py-1.5 text-xs ${
              open === "expense" ? "bg-white/[0.08]" : ""
            }`}
          >
            <IconPlus className="h-3.5 w-3.5" /> Expense
          </button>
        </div>
      </div>

      {formError && <p className="text-red-300 text-xs">{formError}</p>}

      {open === "traveler" && (
        <div className="bg-white/[0.03] border-white/[0.06] animate-fade-in grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
          {editEntity && (
            <p className="text-cyan-300/90 text-[11px] sm:col-span-2">
              Editing {editEntity.name.trim()}
            </p>
          )}
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
          <div className="flex gap-2 sm:col-span-2">
            {editing && (
              <button
                type="button"
                onClick={closeForms}
                className="btn-ghost flex-1"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={submitTraveler}
              disabled={busy || !tName.trim()}
              className="btn-primary flex-1"
            >
              {editEntity ? "Save traveler" : "Add traveler"}
            </button>
          </div>
        </div>
      )}

      {open === "expense" && (
        <div className="bg-white/[0.03] border-white/[0.06] animate-fade-in grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
          {editExpense && (
            <p className="text-cyan-300/90 text-[11px] sm:col-span-2">
              Editing expense
            </p>
          )}
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
            value={eCategory}
            onChange={(e) => setECategory(e.target.value)}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id} className="bg-slate-900">
                {c.label}
              </option>
            ))}
          </select>
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
          <label className="text-slate-300 flex items-center gap-2 text-sm sm:col-span-2">
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

          <div className="flex gap-2 sm:col-span-2">
            {editing && (
              <button
                type="button"
                onClick={closeForms}
                className="btn-ghost flex-1"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={submitExpense}
              disabled={
                busy ||
                !ePayer ||
                !(parseFloat(eAmount) > 0) ||
                (!eAll && eParticipants.length === 0)
              }
              className="btn-primary flex-1"
            >
              {editExpense ? "Save expense" : "Add expense"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
