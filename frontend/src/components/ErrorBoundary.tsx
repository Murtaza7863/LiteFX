import type { ReactNode } from "react";

import { Component } from "react";

// ──────────────────────────────────────────────
// Root error boundary: if anything throws while
// rendering, show a friendly recovery panel instead
// of a blank / broken screen.
// ──────────────────────────────────────────────

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(err: unknown): State {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="glass max-w-md rounded-2xl p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[#c48878]/30 bg-[#c48878]/15 text-[#c48878]">
              !
            </div>
            <h1 className="font-display text-slate-100 mb-2 text-[1.45rem] font-semibold tracking-[-0.03em]">
              Something went wrong
            </h1>
            <p className="text-slate-400 mb-4 text-sm">
              {this.state.message || "An unexpected error occurred."}
            </p>
            <button
              className="btn-primary w-full"
              onClick={() => {
                this.setState({ hasError: false, message: "" });
                window.location.reload();
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
