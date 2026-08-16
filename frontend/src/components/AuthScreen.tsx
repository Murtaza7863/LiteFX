import { useState } from "react";

import type { User } from "../api/client";

import { client, isStaticEngine } from "../api/client";
import { LogoMark, Wordmark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

export function AuthScreen({ onAuthed }: { onAuthed: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "signup" | "hidden">("hidden");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const user =
        mode === "signup"
          ? await client.signup({ name, email, password })
          : await client.login({ email, password });
      onAuthed(user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const demo = async () => {
    setBusy(true);
    setError(null);
    try {
      const user = await client.demo();
      await client.seed({ asNew: true });
      onAuthed(user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 items-center justify-between border-b border-[var(--border)] px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <LogoMark size={36} />
          <Wordmark className="text-[1.2rem]" />
        </div>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="glass w-full max-w-md rounded-xl p-6 sm:p-8">
          <h1 className="font-display text-[1.85rem] leading-[1.15] font-semibold text-[var(--text)]">
            Split the trip. Settle across borders.
          </h1>
          <p className="mt-2.5 text-[15px] leading-7 text-[var(--muted)]">
            Nets messy IOUs into the fewest transfers, then picks a rail for
            each corridor.{" "}
            {isStaticEngine
              ? "This browser demo stays on this device"
              : "Your trips are saved to your account"}{" "}
            — no real money moves.
          </p>
          {error && <p className="mt-4 text-sm text-[#c48878]">{error}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() => void demo()}
            className="btn-primary mt-6 w-full"
          >
            {busy ? "Opening…" : "Open the sample trip"}
          </button>
          {!isStaticEngine && mode === "hidden" ? (
            <p className="mt-5 text-center text-sm text-[var(--muted)]">
              Have an account on this device?{" "}
              <button
                type="button"
                className="link-plain font-medium"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
              >
                Sign in
              </button>
            </p>
          ) : !isStaticEngine ? (
            <form
              className="mt-6 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {mode === "signup" && (
                <input
                  className="input-field"
                  placeholder="Your name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={80}
                />
              )}
              <input
                className="input-field"
                placeholder="Email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                className="input-field"
                placeholder={
                  mode === "signup"
                    ? "Password (10+ chars, letter + number)"
                    : "Password"
                }
                type="password"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "signup" ? 10 : 1}
              />
              <button
                type="submit"
                disabled={busy}
                className="btn-ghost w-full"
              >
                {busy
                  ? "Working…"
                  : mode === "login"
                    ? "Sign in"
                    : "Create account"}
              </button>
              <p className="text-center text-sm text-[var(--muted)]">
                {mode === "login" ? "New here?" : "Already have an account?"}{" "}
                <button
                  type="button"
                  className="link-plain font-medium"
                  onClick={() => {
                    setMode(mode === "login" ? "signup" : "login");
                    setError(null);
                  }}
                >
                  {mode === "login" ? "Create an account" : "Sign in"}
                </button>
              </p>
            </form>
          ) : null}
        </div>
      </main>
    </div>
  );
}
