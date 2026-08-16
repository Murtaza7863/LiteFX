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
    <nav aria-label="Settlement steps">
      <ol className="flex flex-wrap gap-1">
        {steps.map((step) => {
          const done = step.state === "complete";
          const active = step.state === "active";
          const available = step.state === "available";
          const isLoading = step.state === "loading";
          const locked = step.state === "locked";
          const clickable = !locked && !isLoading && !busy;
          const enabled = active || available;

          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={step.onClick}
                disabled={!clickable}
                title={step.sub}
                aria-label={`${step.label}${isLoading ? ", working" : locked ? ", locked" : ""}`}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  clickable
                    ? "hover:bg-white/[0.06] cursor-pointer"
                    : "cursor-default"
                } ${
                  done
                    ? "bg-emerald-500/10 text-emerald-300"
                    : isLoading
                      ? "bg-cyan-500/10 text-cyan-200"
                      : enabled
                        ? "bg-white/[0.06] text-slate-200"
                        : "text-slate-500"
                }`}
              >
                {isLoading ? (
                  <span className="border-cyan-300 h-3 w-3 animate-spin rounded-full border-2 border-t-transparent" />
                ) : (
                  <span className="h-3.5 w-3.5">{step.icon}</span>
                )}
                {step.label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
