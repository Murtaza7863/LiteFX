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

export async function refreshFx(): Promise<boolean> {
  try {
    const res = await fetch(FX_URL, {
      signal: AbortSignal.timeout(4000),
      headers: { Accept: "application/json", "User-Agent": "LiteFX/1.0" },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { rates?: Record<string, number> };
    const rates = data.rates ?? {};
    let updated = false;
    for (const cur of Object.keys(rates)) {
      const perUsd = rates[cur];
      if (typeof perUsd === "number" && perUsd > 0) {
        FX_TABLE[cur] = Math.round((1 / perUsd) * 10000) / 10000;
        updated = true;
      }
    }
    FX_TABLE.USD = 1;
    return updated;
  } catch {
    return false;
  }
}
