import { useEffect, useRef, useState } from "react";

import type { FxSnapshot } from "../api/client";

import { formatUsdPerUnit } from "../../../backend/src/fx";
import { IconGlobe } from "./icons";

export function FxBar({ fx }: { fx?: FxSnapshot }) {
  if (!fx) return null;
  const pairs = Object.entries(fx.rates)
    .filter(([code]) => code !== "USD")
    .sort(([a], [b]) => a.localeCompare(b));
  if (pairs.length === 0) return null;

  const asOf = fx.asOf
    ? new Date(fx.asOf).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  return <FxPopover live={fx.live} asOf={asOf} pairs={pairs} />;
}

function FxPopover({
  live,
  asOf,
  pairs,
}: {
  live: boolean;
  asOf: string | null;
  pairs: [string, number][];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost !px-2.5 !py-1.5"
        title="FX rates"
        aria-expanded={open}
      >
        <IconGlobe className="h-4 w-4" />
      </button>
      {open && (
        <div className="glass-strong animate-scale-in absolute right-0 z-50 mt-2 w-64 rounded-xl p-3">
          <p className="text-slate-500 mb-2 text-[10px] tracking-wide uppercase">
            {live ? "Live FX" : "FX"}
            {asOf ? ` · ${asOf}` : ""}
            <span className="font-normal"> · 1 unit in USD</span>
          </p>
          <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {pairs.map(([code, usd]) => (
              <li
                key={code}
                className="text-slate-300 flex justify-between font-mono text-[12px]"
              >
                <span>1 {code}</span>
                <span>${formatUsdPerUnit(usd)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
