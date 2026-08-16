import { useEffect, useRef, useState } from "react";

import type { User } from "../api/client";

import { Avatar } from "./Avatar";

export function AccountMenu({
  user,
  onReset,
  onLogout,
  resetBusy,
  demoMode = false,
}: {
  user: User;
  onReset: () => void;
  onLogout: () => void;
  resetBusy?: boolean;
  demoMode?: boolean;
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
        className="hover:bg-white/[0.06] flex items-center rounded-full p-0.5 transition-colors"
        aria-expanded={open}
        aria-haspopup="menu"
        title={user.name}
      >
        <Avatar id={user.id} name={user.name} size={28} />
      </button>
      {open && (
        <div
          role="menu"
          className="glass-strong animate-scale-in absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl py-1"
        >
          <div className="border-b border-[var(--border)] px-3 py-2">
            <p className="text-slate-200 truncate text-sm font-medium">
              {demoMode ? "Browser demo" : user.name}
            </p>
            <p className="text-slate-500 truncate text-[11px]">
              {demoMode ? "Saved on this device" : user.email}
            </p>
          </div>
          <button
            type="button"
            role="menuitem"
            disabled={resetBusy}
            onClick={() => {
              setOpen(false);
              onReset();
            }}
            className="hover:bg-white/[0.05] text-slate-300 block w-full px-3 py-2 text-left text-sm disabled:opacity-40"
          >
            Reset this trip to sample
          </button>
          {!demoMode && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="hover:bg-white/[0.05] text-slate-300 block w-full px-3 py-2 text-left text-sm"
            >
              Sign out
            </button>
          )}
          <p className="text-slate-500 border-t border-[var(--border)] px-3 py-2 text-[10px] leading-relaxed">
            Sandbox. Rails are simulated; no real money moves.
          </p>
        </div>
      )}
    </div>
  );
}
