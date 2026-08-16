import { useEffect, useRef, useState } from "react";

import type { TripSummary } from "../api/client";

import { IconCheck, IconMapPin, IconPlus } from "./icons";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function tripLine(t: TripSummary): string {
  const travelers = `${t.travelerCount} traveler${t.travelerCount === 1 ? "" : "s"}`;
  const expenses = `${t.expenseCount} expense${t.expenseCount === 1 ? "" : "s"}`;
  const status = t.settledCount
    ? `${t.settledCount} settled`
    : t.netted
      ? "netted"
      : t.ledgerCount
        ? "history"
        : "open";
  return `${travelers} · ${expenses} · ${status}`;
}

export function TripSwitcher({
  trip,
  trips,
  busy,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  trip?: TripSummary;
  trips: TripSummary[];
  busy?: boolean;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"list" | "new" | "rename">("list");
  const [name, setName] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) {
        setOpen(false);
        setMode("list");
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setMode("list");
      }
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open && mode !== "list") input.current?.focus();
  }, [mode, open]);

  const current = trip ?? trips.find((t) => t.active) ?? trips[0];
  const canDelete = trips.length > 1;

  const submitName = () => {
    const next = name.trim();
    if (!next || !current) return;
    if (mode === "new") onCreate(next);
    else onRename(current.id, next);
    setOpen(false);
    setMode("list");
    setName("");
  };

  return (
    <div ref={root} className="relative min-w-0">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setMode("list");
        }}
        disabled={busy}
        className="hover:bg-white/[0.06] flex max-w-[min(100%,16rem)] items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors disabled:opacity-40 sm:max-w-xs"
        aria-expanded={open}
        aria-haspopup="menu"
        title={current?.name ?? "Trips"}
      >
        <IconMapPin className="text-slate-400 h-3.5 w-3.5 shrink-0" />
        <span className="text-slate-200 min-w-0 truncate text-sm font-medium">
          {current?.name ?? "Trip"}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="glass-strong animate-scale-in absolute left-0 z-50 mt-2 w-[min(calc(100vw-2rem),20rem)] overflow-hidden rounded-xl py-1"
        >
          {mode === "list" ? (
            <>
              <p className="text-slate-500 px-3 pt-2 pb-1 text-[10px] font-medium tracking-wide uppercase">
                Your trips
              </p>
              <div className="max-h-64 overflow-y-auto">
                {trips.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      if (!t.active) onSelect(t.id);
                    }}
                    className="hover:bg-white/[0.05] flex w-full items-start gap-2 px-3 py-2 text-left"
                  >
                    <IconCheck
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${t.active ? "text-slate-200" : "opacity-0"}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-slate-200 block truncate text-sm">
                        {t.name}
                      </span>
                      <span className="text-slate-500 block text-[11px]">
                        {tripLine(t)}
                        {t.updatedAt ? ` · ${formatWhen(t.updatedAt)}` : ""}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-1 border-t border-[var(--border)] py-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMode("new");
                    setName("New trip");
                  }}
                  className="hover:bg-white/[0.05] text-slate-300 flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                >
                  <IconPlus className="h-3.5 w-3.5" />
                  New trip
                </button>
                {current && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMode("rename");
                      setName(current.name);
                    }}
                    className="hover:bg-white/[0.05] text-slate-300 block w-full px-3 py-2 text-left text-sm"
                  >
                    Rename
                  </button>
                )}
                {current && canDelete && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      onDelete(current.id);
                    }}
                    className="hover:bg-white/[0.05] block w-full px-3 py-2 text-left text-sm text-[#c48878]"
                  >
                    Delete this trip
                  </button>
                )}
              </div>
            </>
          ) : (
            <form
              className="px-3 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                submitName();
              }}
            >
              <label className="text-slate-500 text-[10px] font-medium tracking-wide uppercase">
                {mode === "new" ? "New trip" : "Rename trip"}
              </label>
              <input
                ref={input}
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                className="text-slate-100 mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-1.5 text-sm"
                placeholder="Tokyo 2026"
              />
              <div className="mt-2 flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setMode("list")}
                  className="btn-ghost !px-2 !py-1 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!name.trim()}
                  className="btn-primary !px-2 !py-1 text-xs"
                >
                  {mode === "new" ? "Create" : "Save"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
