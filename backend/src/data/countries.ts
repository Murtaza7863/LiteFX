// ──────────────────────────────────────────────
// Broad country / currency / rail base so LiteFX
// handles the world, not a hardcoded handful.
// ──────────────────────────────────────────────

export interface Country {
  code: string;
  name: string;
  currency: string;
  flag: string;
}

export const COUNTRIES: Country[] = [
  { code: "US", name: "United States", currency: "USD", flag: "🇺🇸" },
  { code: "SG", name: "Singapore", currency: "SGD", flag: "🇸🇬" },
  { code: "TH", name: "Thailand", currency: "THB", flag: "🇹🇭" },
  { code: "MY", name: "Malaysia", currency: "MYR", flag: "🇲🇾" },
  { code: "ID", name: "Indonesia", currency: "IDR", flag: "🇮🇩" },
  { code: "PH", name: "Philippines", currency: "PHP", flag: "🇵🇭" },
  { code: "VN", name: "Vietnam", currency: "VND", flag: "🇻🇳" },
  { code: "IN", name: "India", currency: "INR", flag: "🇮🇳" },
  { code: "JP", name: "Japan", currency: "JPY", flag: "🇯🇵" },
  { code: "KR", name: "South Korea", currency: "KRW", flag: "🇰🇷" },
  { code: "CN", name: "China", currency: "CNY", flag: "🇨🇳" },
  { code: "HK", name: "Hong Kong", currency: "HKD", flag: "🇭🇰" },
  { code: "TW", name: "Taiwan", currency: "TWD", flag: "🇹🇼" },
  { code: "AU", name: "Australia", currency: "AUD", flag: "🇦🇺" },
  { code: "NZ", name: "New Zealand", currency: "NZD", flag: "🇳🇿" },
  { code: "GB", name: "United Kingdom", currency: "GBP", flag: "🇬🇧" },
  { code: "DE", name: "Germany", currency: "EUR", flag: "🇩🇪" },
  { code: "FR", name: "France", currency: "EUR", flag: "🇫🇷" },
  { code: "ES", name: "Spain", currency: "EUR", flag: "🇪🇸" },
  { code: "IT", name: "Italy", currency: "EUR", flag: "🇮🇹" },
  { code: "NL", name: "Netherlands", currency: "EUR", flag: "🇳🇱" },
  { code: "PT", name: "Portugal", currency: "EUR", flag: "🇵🇹" },
  { code: "IE", name: "Ireland", currency: "EUR", flag: "🇮🇪" },
  { code: "AT", name: "Austria", currency: "EUR", flag: "🇦🇹" },
  { code: "BE", name: "Belgium", currency: "EUR", flag: "🇧🇪" },
  { code: "FI", name: "Finland", currency: "EUR", flag: "🇫🇮" },
  { code: "GR", name: "Greece", currency: "EUR", flag: "🇬🇷" },
  { code: "CH", name: "Switzerland", currency: "CHF", flag: "🇨🇭" },
  { code: "SE", name: "Sweden", currency: "SEK", flag: "🇸🇪" },
  { code: "NO", name: "Norway", currency: "NOK", flag: "🇳🇴" },
  { code: "DK", name: "Denmark", currency: "DKK", flag: "🇩🇰" },
  { code: "PL", name: "Poland", currency: "PLN", flag: "🇵🇱" },
  { code: "CZ", name: "Czechia", currency: "CZK", flag: "🇨🇿" },
  { code: "CA", name: "Canada", currency: "CAD", flag: "🇨🇦" },
  { code: "MX", name: "Mexico", currency: "MXN", flag: "🇲" },
  { code: "BR", name: "Brazil", currency: "BRL", flag: "🇧🇷" },
  { code: "AR", name: "Argentina", currency: "ARS", flag: "🇦🇷" },
  { code: "CL", name: "Chile", currency: "CLP", flag: "🇨🇱" },
  { code: "CO", name: "Colombia", currency: "COP", flag: "🇨🇴" },
  { code: "PE", name: "Peru", currency: "PEN", flag: "🇵🇪" },
  { code: "ZA", name: "South Africa", currency: "ZAR", flag: "🇿🇦" },
  { code: "AE", name: "UAE", currency: "AED", flag: "🇦🇪" },
  { code: "SA", name: "Saudi Arabia", currency: "SAR", flag: "🇸🇦" },
  { code: "IL", name: "Israel", currency: "ILS", flag: "🇮🇱" },
  { code: "TR", name: "Türkiye", currency: "TRY", flag: "🇹🇷" },
];

export const countryByCode = (code: string): Country | undefined =>
  COUNTRIES.find((c) => c.code === code);

export const currencyOf = (code: string): string => countryByCode(code)?.currency ?? "USD";
export const flagOf = (code: string): string => countryByCode(code)?.flag ?? "🏳️";
export const nameOf = (code: string): string => countryByCode(code)?.name ?? code;

// Static baseline FX (1 unit of currency = X USD). Overridden by live
// rates at boot where available. Broad so any supported country works.
export const STATIC_FX: Record<string, number> = {
  USD: 1, EUR: 1.08, GBP: 1.27, JPY: 0.0067, SGD: 0.74, THB: 0.028,
  AUD: 0.65, CAD: 0.72, CHF: 1.11, CNY: 0.14, HKD: 0.128, INR: 0.012,
  IDR: 0.000062, MYR: 0.21, PHP: 0.017, VND: 0.000039, KRW: 0.00072, TWD: 0.031,
  AED: 0.27, SAR: 0.27, ZAR: 0.055, BRL: 0.18, MXN: 0.05, ARS: 0.0011,
  CLP: 0.00105, COP: 0.00025, PEN: 0.26, NZD: 0.6, SEK: 0.093, NOK: 0.092,
  DKK: 0.145, PLN: 0.25, CZK: 0.043, TRY: 0.03, ILS: 0.27,
};

// Domestic instant rails (per country). Anything else falls back to a
// generic "Local instant rail".
export const LOCAL_RAILS: Record<string, string> = {
  SG: "PayNow", TH: "PromptPay", US: "Zelle", MY: "DuitNow", IN: "UPI",
  JP: "Zengin", AU: "NPP", BR: "Pix", MX: "CoDi", CA: "Interac",
  GB: "Faster Payments", KR: "Toss", DE: "SEPA Instant", FR: "SEPA Instant",
  ES: "SEPA Instant", IT: "SEPA Instant", NL: "SEPA Instant",
};

// Real bilateral instant-payment linkages (sorted "A-B" key).
export const LINKED_CORRIDORS: Record<string, string> = {
  "SG-TH": "PayNow ↔ PromptPay",
  "MY-SG": "DuitNow ↔ PayNow",
  "MY-TH": "DuitNow ↔ PromptPay",
  "IN-SG": "UPI ↔ PayNow",
};

export const linkedKey = (a: string, b: string): string => [a, b].sort().join("-");
