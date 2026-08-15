import { Component } from "react";
import type { ReactNode } from "react";

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
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="glass rounded-2xl p-8 max-w-md text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/15 border border-red-500/30 text-red-300">
              !
            </div>
            <h1 className="text-lg font-semibold text-slate-100 mb-2">Something went wrong</h1>
            <p className="text-sm text-slate-400 mb-4">{this.state.message || "An unexpected error occurred."}</p>
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
