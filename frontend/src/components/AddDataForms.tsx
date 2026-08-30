import { useState, useEffect, useMemo, useRef } from "react";

import type { Entity, Expense, SavedContact } from "../api/client";

import { client } from "../api/client";
import {
  CURRENCY_OPTIONS,
  EXPENSE_CATEGORIES,
  currencyFor,
  classifyExpense,
  alignRailsToCountry,
  primaryRail,
  ME_CONTACT_ID,
} from "../lib/countries";
import { formatUsd, previewShares, toUsd } from "../lib/tripMath";
import { CountrySelect, type CountrySelectHandle } from "./CountrySelect";
import { IconPlus, IconDownload, IconMore } from "./icons";
import {
  methodsMissingAlias,
  PaymentMethodsEditor,
  type PaymentMethod,
} from "./PaymentMethodsEditor";
import { SavedPeople } from "./SavedPeople";

const inputCls = "input-field";

interface Props {
  tripName?: string;
  locked?: boolean;
  entities: Entity[];
  expenses: Expense[];
  expenseCount: number;
  onAdded: (msg: string, opts?: { agent?: boolean }) => void;
  onClear: () => void;
  onLoadSample: () => void;
  contacts?: SavedContact[];
  onAddContact?: (id: string) => void;
  onRemoveContact?: (id: string) => void;
  onSaveCrew?: () => void;
  onAddMe?: () => void;
  meOnTrip?: boolean;
  fxRates?: Record<string, number>;
  travelerSignal?: number;
  expenseSignal?: number;
  highlightExpense?: boolean;
  quiet?: boolean;
  editEntity?: Entity | null;
  editExpense?: Expense | null;
  onCancelEdit?: () => void;
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "trip"
  );
}

function downloadCsv(
  entities: Entity[],
  expenses: Expense[],
  tripName: string,
) {
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
  a.download = `litefx-${slug(tripName)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AddDataForms({
  tripName = "Trip",
  locked = false,
  entities,
  expenses,
  expenseCount,
  onAdded,
  onClear,
  onLoadSample,
  contacts = [],
  onAddContact,
  onRemoveContact,
  onSaveCrew,
  onAddMe,
  meOnTrip = false,
  fxRates,
  travelerSignal = 0,
  expenseSignal = 0,
  highlightExpense = false,
  quiet = false,
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

  const [tName, setTName] = useState("");
  const [tCountry, setTCountry] = useState("SG");
  const tCountryRef = useRef("SG");
  const countrySelectRef = useRef<CountrySelectHandle>(null);
  const [tContact, setTContact] = useState("");
  const [tMethods, setTMethods] = useState<PaymentMethod[]>([
    { railType: primaryRail("SG"), alias: "" },
  ]);

  const [eDesc, setEDesc] = useState("");
  const [eAmount, setEAmount] = useState("");
  const [eCurrency, setECurrency] = useState("USD");
  const [eCategory, setECategory] = useState("general");
  const [eCategoryLocked, setECategoryLocked] = useState(false);
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
    tCountryRef.current = editEntity.country;
    setTContact(editEntity.contact.value ?? "");
    setTMethods(
      editEntity.linkedRailAliases.length
        ? editEntity.linkedRailAliases.map((a) => ({
            railType: a.railType,
            alias: a.alias,
          }))
        : [],
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
    const guessed = classifyExpense(editExpense.description).category;
    setECategoryLocked((editExpense.category || "general") !== guessed);
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
    if (ePayer && !entities.some((e) => e.id === ePayer)) setEPayer("");
  }, [entities, ePayer]);

  useEffect(() => {
    const known = new Set(entities.map((e) => e.id));
    setEParticipants((ids) => {
      const next = ids.filter((id) => known.has(id));
      return next.length === ids.length ? ids : next;
    });
  }, [entities]);

  useEffect(() => {
    if (editExpense || !ePayer) return;
    const payer = entities.find((e) => e.id === ePayer);
    if (payer) setECurrency(currencyFor(payer.country));
  }, [ePayer, editExpense, entities]);

  const resetTravelerForm = () => {
    setTName("");
    setTContact("");
    setTMethods([{ railType: primaryRail(tCountryRef.current), alias: "" }]);
    setFormError(null);
  };

  const resetExpenseForm = () => {
    setEDesc("");
    setEAmount("");
    setEParts({});
    setESplitMode("equal");
    setECategory("general");
    setECategoryLocked(false);
    setEAll(true);
  };

  const closeForms = () => {
    setOpen(null);
    resetTravelerForm();
    resetExpenseForm();
    setFormError(null);
    onCancelEdit?.();
  };

  useEffect(() => {
    if (quiet && travelerSignal > 0 && !editEntity && !editExpense) {
      resetTravelerForm();
      setOpen("traveler");
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [quiet, travelerSignal, editEntity, editExpense]);

  useEffect(() => {
    if (expenseSignal === 0 || entities.length === 0) return;
    resetExpenseForm();
    setEPayer((cur) =>
      cur && entities.some((en) => en.id === cur)
        ? cur
        : (entities[0]?.id ?? ""),
    );
    setOpen("expense");
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Only the signal should open the form. Including entities/edit state
    // would reopen it after a save or trip refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseSignal]);

  const submitTraveler = async () => {
    if (!tName.trim()) return;
    countrySelectRef.current?.commit();
    const country = tCountryRef.current;
    const methods = alignRailsToCountry(country, tMethods, true);
    const toSave = methods.length ? methods : tMethods;
    const missing = methodsMissingAlias(toSave);
    if (missing) {
      setFormError(missing);
      return;
    }
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
          country,
          linkedRailAliases: toSave,
          contact,
        });
        resetTravelerForm();
        onAdded(`Updated ${name}`, {
          agent:
            editEntity.country !== country ||
            JSON.stringify(editEntity.linkedRailAliases) !==
              JSON.stringify(toSave),
        });
        closeForms();
      } else {
        await client.addEntity({
          name,
          country,
          linkedRailAliases: toSave,
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
    if (!ePayer) {
      setFormError("Choose who paid for this expense.");
      return;
    }
    if (!Number.isFinite(amt) || !(amt > 0)) {
      setFormError("Enter a positive expense amount.");
      return;
    }
    if (amt > 1_000_000_000_000) {
      setFormError("Expense amount is too large.");
      return;
    }
    const partList = eAll ? entities.map((e) => e.id) : eParticipants;
    if (partList.length === 0) {
      setFormError("Select at least one person to split this expense with.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const parts: Record<string, number> = {};
      if (eSplitMode !== "equal") {
        for (const pid of partList) {
          const raw = eParts[pid]?.trim() ?? "";
          if (!raw) continue;
          const v = Number(raw);
          if (!Number.isFinite(v) || v < 0) {
            throw new Error("Split shares must be positive numbers.");
          }
          if (v > 0) parts[pid] = v;
        }
        const assigned = Object.values(parts).reduce((sum, v) => sum + v, 0);
        if (eSplitMode === "percent" && assigned > 100.01) {
          throw new Error("Percentage shares cannot exceed 100%.");
        }
        if (eSplitMode === "amount" && assigned > amt + 0.01) {
          throw new Error("Assigned shares cannot exceed the expense total.");
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
        const money =
          editExpense.payerId !== payload.payerId ||
          editExpense.amount !== payload.amount ||
          editExpense.currency !== payload.currency ||
          editExpense.participantIds.join() !== payload.participantIds.join() ||
          (editExpense.split?.mode ?? "equal") !==
            (payload.split?.mode ?? "equal") ||
          JSON.stringify(editExpense.split?.parts ?? null) !==
            JSON.stringify(
              payload.split && payload.split.mode !== "equal"
                ? payload.split.parts
                : null,
            );
        resetExpenseForm();
        onAdded("Updated expense", { agent: money });
        closeForms();
      } else {
        await client.addExpense(payload);
        resetExpenseForm();
        onAdded("Added expense", { agent: true });
        setOpen(null);
      }
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const expenseGuess = classifyExpense(eDesc);

  const partEntities = eAll
    ? entities
    : entities.filter((en) => eParticipants.includes(en.id));

  const splitPreview = useMemo(() => {
    const amount = parseFloat(eAmount);
    if (
      !Number.isFinite(amount) ||
      !(amount > 0) ||
      partEntities.length === 0
    ) {
      return [];
    }
    const parts: Record<string, number> = {};
    for (const [id, raw] of Object.entries(eParts)) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) parts[id] = n;
    }
    const shares = previewShares({
      amount,
      payerId: ePayer,
      participantIds: partEntities.map((en) => en.id),
      mode: eSplitMode,
      parts,
    });
    return partEntities.map((en) => ({
      id: en.id,
      name: en.name.trim(),
      share: shares[en.id] ?? 0,
      payer: en.id === ePayer,
    }));
  }, [eAmount, ePayer, eParts, eSplitMode, partEntities]);

  const unsavedCrew = entities.some((e) => !e.contactId);
  const editing = !!(editEntity || editExpense);

  if (quiet && !open && !editing) return null;

  return (
    <div
      ref={rootRef}
      className={
        quiet
          ? "animate-fade-in space-y-3 border-t border-[var(--border)] pt-5"
          : "space-y-3"
      }
    >
      {!quiet && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-slate-100 truncate text-[1.25rem] font-semibold tracking-[-0.03em]">
              {tripName}
            </h2>
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
                disabled={locked}
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
                    Open sample trip
                  </button>
                  {expenses.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        downloadCsv(entities, expenses, tripName);
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
                    className="hover:bg-white/[0.05] block w-full px-3 py-2 text-left text-sm text-[#c48878]"
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
                resetTravelerForm();
                setOpen("traveler");
              }}
              disabled={locked}
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
                resetExpenseForm();
                setEPayer((cur) =>
                  cur && entities.some((en) => en.id === cur)
                    ? cur
                    : (entities[0]?.id ?? ""),
                );
                setOpen("expense");
              }}
              disabled={locked || entities.length === 0}
              title={
                entities.length === 0
                  ? "Add a traveler first"
                  : "Add an expense"
              }
              className={
                highlightExpense && open !== "expense"
                  ? "btn-primary !px-3 !py-1.5 text-xs"
                  : `btn-ghost !px-3 !py-1.5 text-xs ${
                      open === "expense" ? "bg-white/[0.08]" : ""
                    }`
              }
            >
              <IconPlus className="h-3.5 w-3.5" /> Expense
            </button>
          </div>
        </div>
      )}

      {formError && <p className="text-xs text-[#c48878]">{formError}</p>}

      {onAddContact && onRemoveContact && contacts.length > 0 && !quiet && (
        <SavedPeople
          contacts={contacts.filter((c) => c.id !== ME_CONTACT_ID)}
          entities={entities}
          locked={locked || busy}
          onAdd={onAddContact}
          onRemove={onRemoveContact}
        />
      )}
      {onAddMe && !quiet && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={locked || busy || meOnTrip}
            onClick={onAddMe}
            className="btn-ghost !px-3 !py-1.5 text-xs"
          >
            {meOnTrip ? "You are on this trip" : "Add me to this trip"}
          </button>
          <p className="text-slate-500 text-[11px]">
            Uses the rails saved in Payment methods.
          </p>
        </div>
      )}
      {onSaveCrew && unsavedCrew && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={locked || busy}
            onClick={onSaveCrew}
            className="btn-ghost !px-3 !py-1.5 text-xs"
          >
            Save this crew
          </button>
          <p className="text-slate-500 text-[11px]">
            Keeps these people for the next trip.
          </p>
        </div>
      )}

      {open === "traveler" && (
        <form
          className={
            quiet
              ? "animate-fade-in grid gap-3 sm:grid-cols-2"
              : "bg-white/[0.03] border-white/[0.06] animate-fade-in grid gap-3 rounded-xl border p-3 sm:grid-cols-2"
          }
          onSubmit={(e) => {
            e.preventDefault();
            void submitTraveler();
          }}
        >
          {quiet && !editEntity && (
            <p className="font-display text-slate-100 text-lg font-semibold tracking-[-0.03em] sm:col-span-2">
              New traveler
            </p>
          )}
          {editEntity && (
            <p className="text-slate-400 text-[11px] sm:col-span-2">
              Editing {editEntity.name.trim()}
            </p>
          )}
          <input
            autoFocus
            className={inputCls}
            placeholder="Name"
            value={tName}
            onChange={(e) => setTName(e.target.value)}
          />
          <CountrySelect
            ref={countrySelectRef}
            value={tCountry}
            onChange={(code) => {
              if (code === tCountryRef.current) return;
              const next = alignRailsToCountry(code, tMethods, true);
              tCountryRef.current = code;
              setTCountry(code);
              setTMethods(
                next.length
                  ? next
                  : tMethods.length
                    ? [{ railType: primaryRail(code), alias: tMethods[0]?.alias ?? "" }]
                    : [],
              );
            }}
          />
          <input
            className={`${inputCls} sm:col-span-2`}
            placeholder="Phone or email (for claim links)"
            value={tContact}
            onChange={(e) => setTContact(e.target.value)}
          />
          <PaymentMethodsEditor
            country={tCountry}
            value={tMethods}
            onChange={setTMethods}
            disabled={busy}
          />
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={closeForms}
              className="btn-ghost flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              onMouseDown={() => countrySelectRef.current?.commit()}
              disabled={busy || !tName.trim()}
              className="btn-primary flex-1"
            >
              {editEntity ? "Save traveler" : "Add traveler"}
            </button>
          </div>
          <p className="text-slate-500 text-[11px] sm:col-span-2">
            {editEntity
              ? "Edits update this person in saved people for later trips."
              : "Pick rails that exist in their country and an ID send slips can use. Remove every rail for a claim link instead."}
          </p>
        </form>
      )}

      {open === "expense" && (
        <div className="bg-white/[0.03] border-white/[0.06] animate-fade-in grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
          {editExpense && (
            <p className="text-slate-400 text-[11px] sm:col-span-2">
              Editing expense
            </p>
          )}
          <input
            className={`${inputCls} sm:col-span-2`}
            placeholder="Hotel, Grab to airport, dinner…"
            value={eDesc}
            onChange={(e) => {
              const v = e.target.value;
              setEDesc(v);
              if (!eCategoryLocked) setECategory(classifyExpense(v).category);
            }}
            aria-label="Expense title"
          />
          <div
            className="flex flex-wrap items-center gap-1.5 sm:col-span-2"
            role="group"
            aria-label="Category"
          >
            {EXPENSE_CATEGORIES.map((c) => {
              const on = eCategory === c.id;
              const auto =
                !eCategoryLocked &&
                expenseGuess.category === c.id &&
                !!expenseGuess.matched;
              return (
                <button
                  type="button"
                  key={c.id}
                  aria-pressed={on}
                  onClick={() => {
                    if (on && eCategoryLocked) {
                      setECategoryLocked(false);
                      setECategory(expenseGuess.category);
                      return;
                    }
                    setECategory(c.id);
                    setECategoryLocked(true);
                  }}
                  className={`chip border transition-colors ${
                    on
                      ? "border-transparent bg-[var(--text)] text-[var(--bg)]"
                      : "bg-white/[0.03] border-white/[0.08] text-slate-400"
                  }`}
                >
                  {c.label}
                  {auto && <span className="font-normal opacity-50">auto</span>}
                </button>
              );
            })}
            {eCategoryLocked &&
              expenseGuess.matched &&
              expenseGuess.category !== eCategory && (
                <button
                  type="button"
                  className="text-slate-500 hover:text-slate-300 text-[11px]"
                  onClick={() => {
                    setECategory(expenseGuess.category);
                    setECategoryLocked(false);
                  }}
                >
                  Use {expenseGuess.label}
                </button>
              )}
          </div>
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
          <label className="text-slate-300 flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={eAll}
              onChange={(e) => setEAll(e.target.checked)}
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
                    aria-pressed={on}
                    onClick={() =>
                      setEParticipants((p) =>
                        on ? p.filter((x) => x !== en.id) : [...p, en.id],
                      )
                    }
                    className={`chip border transition-colors ${
                      on
                        ? "border-transparent bg-[var(--text)] text-[var(--bg)]"
                        : "bg-white/[0.03] border-white/[0.08] text-slate-400"
                    }`}
                  >
                    {en.name.trim().split(" ")[0]}
                  </button>
                );
              })}
              <p className="text-slate-500 w-full text-[11px]">
                Leave yourself off if you covered their share.
              </p>
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

          {splitPreview.length > 0 && (
            <div className="bg-black/25 border-white/[0.05] max-h-40 space-y-1 overflow-y-auto rounded-lg border px-3 py-2 sm:col-span-2">
              <p className="text-slate-500 text-[10px] font-medium tracking-wide uppercase">
                Each share
              </p>
              {splitPreview.map((row) => {
                const usd = toUsd(row.share, eCurrency, fxRates);
                return (
                  <div
                    key={row.id}
                    className="text-slate-300 flex items-baseline justify-between gap-2 text-[12px]"
                  >
                    <span className="truncate">
                      {row.name.split(" ")[0]}
                      {row.payer ? (
                        <span className="text-slate-600"> · paid</span>
                      ) : null}
                    </span>
                    <span className="font-mono whitespace-nowrap">
                      {row.share.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}{" "}
                      {eCurrency}
                      {usd != null && eCurrency !== "USD" ? (
                        <span className="text-slate-600">
                          {" "}
                          ({formatUsd(usd)})
                        </span>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-slate-500 sm:col-span-2 text-[11px] leading-5">
            The agent nets this across the trip and picks the cheapest rail and
            FX for each send. Nothing is settled until you confirm.
          </p>
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={closeForms}
              className="btn-ghost flex-1"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitExpense}
              disabled={
                busy ||
                !ePayer ||
                !Number.isFinite(parseFloat(eAmount)) ||
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
