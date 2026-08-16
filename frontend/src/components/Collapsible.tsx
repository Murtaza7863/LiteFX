import { useState, type ReactNode } from "react";

import { IconChevron } from "./icons";

export function Collapsible({
  title,
  sub,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  sub?: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="glass animate-fade-in-up overflow-hidden rounded-2xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-white/[0.03] flex w-full items-center gap-3 px-4 py-3 text-left transition-colors sm:px-5"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <p className="text-slate-100 font-display text-[1.05rem] font-semibold tracking-[-0.03em]">
            {title}
          </p>
          {sub && (
            <p className="text-slate-500 mt-0.5 truncate text-xs">{sub}</p>
          )}
        </div>
        {badge && <div className="hidden shrink-0 sm:block">{badge}</div>}
        <IconChevron
          className={`text-slate-500 h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="px-4 pb-4 sm:px-5">{children}</div>}
    </section>
  );
}
