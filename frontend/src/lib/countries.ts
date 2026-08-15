// Broad country base (mirrors backend) so the UI renders flags/names
// and the forms offer the whole world, not a hardcoded handful.
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
  { code: "MY", name: "Malaysia", currency: "MYR", flag: "🇲" },
  { code: "ID", name: "Indonesia", currency: "IDR", flag: "🇮🇩" },
  { code: "PH", name: "Philippines", currency: "PHP", flag: "🇵" },
  { code: "VN", name: "Vietnam", currency: "VND", flag: "🇻🇳" },
  { code: "IN", name: "India", currency: "INR", flag: "🇮" },
  { code: "JP", name: "Japan", currency: "JPY", flag: "🇯🇵" },
  { code: "KR", name: "South Korea", currency: "KRW", flag: "🇰" },
  { code: "CN", name: "China", currency: "CNY", flag: "🇨🇳" },
  { code: "HK", name: "Hong Kong", currency: "HKD", flag: "🇭🇰" },
  { code: "TW", name: "Taiwan", currency: "TWD", flag: "🇹🇼" },
  { code: "AU", name: "Australia", currency: "AUD", flag: "🇦🇺" },
  { code: "NZ", name: "New Zealand", currency: "NZD", flag: "🇳" },
  { code: "GB", name: "United Kingdom", currency: "GBP", flag: "🇬🇧" },
  { code: "DE", name: "Germany", currency: "EUR", flag: "🇩🇪" },
  { code: "FR", name: "France", currency: "EUR", flag: "🇫🇷" },
  { code: "ES", name: "Spain", currency: "EUR", flag: "🇪" },
  { code: "IT", name: "Italy", currency: "EUR", flag: "🇮🇹" },
  { code: "NL", name: "Netherlands", currency: "EUR", flag: "🇳" },
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
  { code: "MX", name: "Mexico", currency: "MXN", flag: "🇲🇽" },
  { code: "BR", name: "Brazil", currency: "BRL", flag: "🇧🇷" },
  { code: "AR", name: "Argentina", currency: "ARS", flag: "🇦🇷" },
  { code: "CL", name: "Chile", currency: "CLP", flag: "🇨🇱" },
  { code: "CO", name: "Colombia", currency: "COP", flag: "🇨" },
  { code: "PE", name: "Peru", currency: "PEN", flag: "🇵" },
  { code: "ZA", name: "South Africa", currency: "ZAR", flag: "🇿🇦" },
  { code: "AE", name: "UAE", currency: "AED", flag: "🇦🇪" },
  { code: "SA", name: "Saudi Arabia", currency: "SAR", flag: "🇸🇦" },
  { code: "IL", name: "Israel", currency: "ILS", flag: "🇮🇱" },
  { code: "TR", name: "Türkiye", currency: "TRY", flag: "🇹🇷" },
];

export const CURRENCY_OPTIONS = Array.from(new Set(COUNTRIES.map((c) => c.currency)));

// Derive a flag emoji from an ISO code (regional indicators), so we never
// rely on hand-typed emoji that can get mangled.
export const flagFromCode = (code: string): string =>
  code
    .toUpperCase()
    .replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));

// Primary domestic payment rail per country (mirrors the backend).
const PRIMARY_RAIL: Record<string, string> = {
  SG: "PayNow", TH: "PromptPay", US: "Zelle", MY: "DuitNow", IN: "UPI",
  JP: "Zengin", AU: "NPP", BR: "Pix", MX: "CoDi", CA: "Interac",
  GB: "Faster Payments", KR: "Toss", DE: "SEPA Instant", FR: "SEPA Instant",
  ES: "SEPA Instant", IT: "SEPA Instant", NL: "SEPA Instant",
};

// The payment modes offered for a given country.
export const railsFor = (code: string): string[] => {
  const primary = PRIMARY_RAIL[code.toUpperCase()];
  return primary ? [primary, "Bank transfer"] : ["Local instant rail", "Bank transfer (SWIFT)"];
};

export const primaryRail = (code: string): string => railsFor(code)[0];
