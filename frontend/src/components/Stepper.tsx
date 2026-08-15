// ──────────────────────────────────────────────
// Stepper — a guided flow indicator for the five
// agent stages. Each node shows locked / available /
// active / loading / complete state, connected by a
// progress line.
// ──────────────────────────────────────────────
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
    <div className="glass rounded-2xl p-2">
      <div className="flex items-stretch gap-0 overflow-x-auto">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          const done = step.state === "complete";
          const active = step.state === "active";
          const available = step.state === "available";
          const isLoading = step.state === "loading";
          const locked = step.state === "locked";
          const clickable = !locked && !isLoading && !busy;
          const enabled = active || available;

          return (
            <div key={step.id} className="flex items-center flex-1 min-w-0">
              {/* Node */}
              <button
                onClick={step.onClick}
                disabled={!clickable}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 w-full text-left justify-center md:justify-start transition-all duration-200 ${
                  clickable ? "hover:bg-white/[0.05] cursor-pointer" : "cursor-default"
                } ${active ? "bg-white/[0.06]" : ""}`}
              >
                {/* Circle */}
                <span
                  className={`relative flex h-9 w-9 items-center justify-center rounded-full text-base shrink-0 transition-all duration-300 ${
                    done
                      ? "bg-gradient-to-br from-cyan-400 to-violet-500 text-white shadow-glow-cyan"
                      : isLoading
                      ? "bg-white/[0.08] border border-cyan-400/50 text-cyan-300 ring-4 ring-cyan-400/10"
                      : enabled
                      ? "bg-white/[0.07] border border-cyan-400/40 text-cyan-200"
                      : "bg-white/[0.04] border border-white/[0.08] text-slate-600"
                  }`}
                >
                  {done ? (
                    <CheckIcon className="h-4 w-4" />
                  ) : isLoading ? (
                    <span className="h-4 w-4 rounded-full border-2 border-cyan-300 border-t-transparent animate-spin" />
                  ) : (
                    <span>{step.icon}</span>
                  )}
                  {active && !isLoading && (
                    <span className="absolute inset-0 rounded-full border border-cyan-400/40 animate-ping" />
                  )}
                </span>

                {/* Label (hidden on small screens; icon-only keeps it compact) */}
                <span className="min-w-0 hidden md:block">
                  <span
                    className={`block text-[13px] font-semibold leading-tight truncate ${
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
                    className={`hidden lg:block text-[11px] leading-tight truncate ${
                      done ? "text-slate-400" : enabled || isLoading ? "text-slate-400" : "text-slate-700"
                    }`}
                  >
                    {isLoading ? "Working…" : step.sub}
                  </span>
                </span>
              </button>

              {/* Connector */}
              {!isLast && (
                <div className="flex-shrink-0 w-4 sm:w-8 flex items-center justify-center">
                  <div
                    className={`h-px w-full transition-colors duration-500 ${
                      done ? "bg-gradient-to-r from-cyan-400/70 to-violet-400/70" : "bg-white/[0.08]"
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
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
