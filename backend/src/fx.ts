import { FX_TABLE } from "./types.js";

// ──────────────────────────────────────────────
// Live FX rates from a free, no-API-key provider
// (frankfurter.app / ECB reference rates). Falls
// back to the static table if the network is
// unavailable, so the app always works.
//
// FX_TABLE stores "1 unit of currency = X USD".
// Frankfurter returns "1 USD = Y cur", so X = 1/Y.
// ──────────────────────────────────────────────

// frankfurter.app 301s here; request all USD rates (unsupported
// symbols are simply omitted — listing them in `to=` can 422).
const FX_URL = "https://api.frankfurter.dev/v1/latest?base=USD";

let fxLive = false;
let fxAsOf: string | null = null;

export interface FxSnapshot {
  live: boolean;
  asOf: string | null;
  rates: Record<string, number>;
}

/** Keep extra digits for weak currencies (IDR, VND, KRW). */
export function roundUsdPerUnit(x: number): number {
  if (x >= 0.01) return Math.round(x * 1e6) / 1e6;
  return Math.round(x * 1e8) / 1e8;
}

export function formatUsdPerUnit(rate: number): string {
  if (rate >= 0.1) return rate.toFixed(2);
  if (rate >= 0.01) return rate.toFixed(3);
  if (rate >= 0.001) return rate.toFixed(4);
  return rate.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

export function getFxSnapshot(currencies?: string[]): FxSnapshot {
  const keys =
    currencies === undefined
      ? Object.keys(FX_TABLE)
      : [...new Set(["USD", ...currencies])];
  const rates: Record<string, number> = {};
  for (const k of keys) {
    if (FX_TABLE[k] != null) rates[k] = FX_TABLE[k];
  }
  return { live: fxLive, asOf: fxAsOf, rates };
}

function abortAfter(ms: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

export async function refreshFx(): Promise<boolean> {
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    // Forbidden in browsers (and can force a CORS preflight). Keep it on Node.
    if (typeof window === "undefined") headers["User-Agent"] = "LiteFX/1.0";
    const res = await fetch(FX_URL, {
      signal: abortAfter(4000),
      headers,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      rates?: Record<string, number>;
      date?: string;
    };
    const rates = data.rates ?? {};
    let updated = false;
    for (const cur of Object.keys(rates)) {
      const perUsd = rates[cur];
      if (typeof perUsd === "number" && perUsd > 0) {
        FX_TABLE[cur] = roundUsdPerUnit(1 / perUsd);
        updated = true;
      }
    }
    FX_TABLE.USD = 1;
    if (updated) {
      fxLive = true;
      fxAsOf = data.date
        ? `${data.date}T00:00:00.000Z`
        : new Date().toISOString();
    }
    return updated;
  } catch {
    return false;
  }
}
