import { useState } from "react";

import type { User } from "../api/client";

import { client } from "../api/client";
import { LogoMark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

export function AuthScreen({ onAuthed }: { onAuthed: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
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
      await client.seed();
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
          <p className="font-display text-[16px] font-bold tracking-tight">
            Lite<span className="brand-text">FX</span>
          </p>
        </div>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="glass w-full max-w-md rounded-3xl p-6 sm:p-8">
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text)]">
            {mode === "login" ? "Sign in" : "Create an account"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            Your trip stays on this device's sandbox — each account has its own
            travelers, expenses, and settlements.
          </p>
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
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="btn-primary w-full"
            >
              {busy
                ? "Working…"
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
          <button
            type="button"
            disabled={busy}
            onClick={() => void demo()}
            className="btn-ghost mt-3 w-full"
          >
            Continue with a demo trip
          </button>
          <p className="mt-5 text-center text-sm text-[var(--muted)]">
            {mode === "login" ? "New here?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="text-cyan-500 font-medium hover:underline"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError(null);
              }}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
