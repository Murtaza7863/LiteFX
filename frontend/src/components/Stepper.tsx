import type { ReactNode } from "react";

export interface Step {
  id: string;
  label: string;
  sub: string;
  icon: ReactNode;
  state: "locked" | "available" | "active" | "loading" | "complete";
  onClick: () => void;
}

interface Props {
  steps: Step[];
  busy?: boolean;
}

export function Stepper({ steps, busy = false }: Props) {
  return (
    <nav className="glass rounded-2xl p-1.5 sm:p-2">
      <ol className="grid grid-cols-5 gap-1">
        {steps.map((step) => {
          const done = step.state === "complete";
          const active = step.state === "active";
          const available = step.state === "available";
          const isLoading = step.state === "loading";
          const locked = step.state === "locked";
          const clickable = !locked && !isLoading && !busy;
          const enabled = active || available;

          return (
            <li key={step.id} className="min-w-0">
              <button
                type="button"
                onClick={step.onClick}
                disabled={!clickable}
                className={`flex w-full min-w-0 flex-col items-center gap-1.5 rounded-xl px-1 py-2 sm:flex-row sm:items-center sm:gap-2.5 sm:px-2.5 sm:py-2.5 ${
                  clickable
                    ? "hover:bg-white/[0.05] cursor-pointer"
                    : "cursor-default"
                } ${active ? "bg-white/[0.06]" : ""}`}
              >
                <span
                  className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base transition-all duration-300 sm:h-9 sm:w-9 ${
                    done
                      ? "from-cyan-400 to-violet-500 text-white shadow-glow-cyan bg-gradient-to-br"
                      : isLoading
                        ? "bg-white/[0.08] border-cyan-400/50 text-cyan-300 ring-cyan-400/10 border ring-4"
                        : enabled
                          ? "bg-white/[0.07] border-cyan-400/40 text-cyan-200 border"
                          : "bg-white/[0.04] border-white/[0.08] text-slate-600 border"
                  }`}
                >
                  {done ? (
                    <CheckIcon className="h-4 w-4" />
                  ) : isLoading ? (
                    <span className="border-cyan-300 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
                  ) : (
                    <span>{step.icon}</span>
                  )}
                  {active && !isLoading && (
                    <span className="border-cyan-400/50 absolute inset-0 animate-pulse rounded-full border-2" />
                  )}
                </span>

                <span className="hidden min-w-0 sm:block">
                  <span
                    className={`block truncate text-[11px] leading-tight font-semibold md:text-[13px] ${
                      done
                        ? "text-slate-100"
                        : enabled || isLoading
                          ? "text-cyan-100"
                          : "text-slate-600"
                    }`}
                  >
                    {step.label}
                  </span>
                  <span
                    className={`hidden truncate text-[11px] leading-tight lg:block ${
                      done
                        ? "text-slate-400"
                        : enabled || isLoading
                          ? "text-slate-400"
                          : "text-slate-700"
                    }`}
                  >
                    {isLoading ? "Working…" : step.sub}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
