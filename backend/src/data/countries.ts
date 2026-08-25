// ──────────────────────────────────────────────
// Country / currency / rail / payout base.
// Every listed country has a named domestic rail,
// local wallets for claim payouts, and an FX rate.
// ──────────────────────────────────────────────

export interface Country {
  code: string;
  name: string;
  currency: string;
  /** Domestic payment rails a traveler can link (first = primary instant). */
  rails: string[];
  /** Local e-wallets / apps offered on a claim-link payout. */
  wallets: string[];
}

export const COUNTRIES: Country[] = [
  {
    code: "US",
    name: "United States",
    currency: "USD",
    rails: ["Zelle", "FedNow", "ACH"],
    wallets: ["Venmo", "PayPal", "Cash App"],
  },
  {
    code: "SG",
    name: "Singapore",
    currency: "SGD",
    rails: ["PayNow", "FAST"],
    wallets: ["GrabPay", "PayLah!", "Alipay"],
  },
  {
    code: "TH",
    name: "Thailand",
    currency: "THB",
    rails: ["PromptPay"],
    wallets: ["TrueMoney", "Rabbit LINE Pay", "GrabPay"],
  },
  {
    code: "MY",
    name: "Malaysia",
    currency: "MYR",
    rails: ["DuitNow"],
    wallets: ["Touch 'n Go eWallet", "GrabPay", "Boost"],
  },
  {
    code: "ID",
    name: "Indonesia",
    currency: "IDR",
    rails: ["QRIS", "BI-FAST"],
    wallets: ["GoPay", "OVO", "DANA"],
  },
  {
    code: "PH",
    name: "Philippines",
    currency: "PHP",
    rails: ["InstaPay", "PESONet"],
    wallets: ["GCash", "Maya"],
  },
  {
    code: "VN",
    name: "Vietnam",
    currency: "VND",
    rails: ["Napas 247", "VietQR"],
    wallets: ["MoMo", "ZaloPay", "ViettelPay"],
  },
  {
    code: "IN",
    name: "India",
    currency: "INR",
    rails: ["UPI", "IMPS"],
    wallets: ["PhonePe", "Google Pay", "Paytm"],
  },
  {
    code: "JP",
    name: "Japan",
    currency: "JPY",
    rails: ["Zengin"],
    wallets: ["PayPay", "LINE Pay", "Rakuten Pay"],
  },
  {
    code: "KR",
    name: "South Korea",
    currency: "KRW",
    rails: ["Open Banking", "KFTC"],
    wallets: ["Toss", "KakaoPay", "Naver Pay"],
  },
  {
    code: "CN",
    name: "China",
    currency: "CNY",
    rails: ["UnionPay"],
    wallets: ["Alipay", "WeChat Pay"],
  },
  {
    code: "HK",
    name: "Hong Kong",
    currency: "HKD",
    rails: ["FPS"],
    wallets: ["PayMe", "AlipayHK", "WeChat Pay HK"],
  },
  {
    code: "TW",
    name: "Taiwan",
    currency: "TWD",
    rails: ["FISC", "Taiwan Pay"],
    wallets: ["LINE Pay", "JKoPay", "Plus Pay"],
  },
  {
    code: "AU",
    name: "Australia",
    currency: "AUD",
    rails: ["NPP", "PayID"],
    wallets: ["PayPal", "Beem It"],
  },
  {
    code: "NZ",
    name: "New Zealand",
    currency: "NZD",
    rails: ["PayTo"],
    wallets: ["PayPal", "PoLi"],
  },
  {
    code: "GB",
    name: "United Kingdom",
    currency: "GBP",
    rails: ["Faster Payments", "CHAPS"],
    wallets: ["PayPal", "Revolut", "Monzo"],
  },
  {
    code: "DE",
    name: "Germany",
    currency: "EUR",
    rails: ["SEPA Instant", "SEPA Credit Transfer"],
    wallets: ["PayPal", "Revolut", "Giropay"],
  },
  {
    code: "FR",
    name: "France",
    currency: "EUR",
    rails: ["SEPA Instant", "SEPA Credit Transfer"],
    wallets: ["PayPal", "Lydia", "Paylib"],
  },
  {
    code: "ES",
    name: "Spain",
    currency: "EUR",
    rails: ["SEPA Instant", "SEPA Credit Transfer"],
    wallets: ["Bizum", "PayPal"],
  },
  {
    code: "IT",
    name: "Italy",
    currency: "EUR",
    rails: ["SEPA Instant", "SEPA Credit Transfer"],
    wallets: ["Satispay", "PayPal"],
  },
  {
    code: "NL",
    name: "Netherlands",
    currency: "EUR",
    rails: ["SEPA Instant", "iDEAL"],
    wallets: ["Tikkie", "PayPal"],
  },
  {
    code: "PT",
    name: "Portugal",
    currency: "EUR",
    rails: ["SEPA Instant", "SEPA Credit Transfer"],
    wallets: ["MB Way", "PayPal"],
  },
  {
    code: "IE",
    name: "Ireland",
    currency: "EUR",
    rails: ["SEPA Instant", "SEPA Credit Transfer"],
    wallets: ["Revolut", "PayPal"],
  },
  {
    code: "AT",
    name: "Austria",
    currency: "EUR",
    rails: ["SEPA Instant", "SEPA Credit Transfer"],
    wallets: ["PayPal", "eps"],
  },
  {
    code: "BE",
    name: "Belgium",
    currency: "EUR",
    rails: ["SEPA Instant", "SEPA Credit Transfer"],
    wallets: ["Payconiq", "PayPal"],
  },
  {
    code: "FI",
    name: "Finland",
    currency: "EUR",
    rails: ["SEPA Instant", "SEPA Credit Transfer"],
    wallets: ["MobilePay", "PayPal"],
  },
  {
    code: "GR",
    name: "Greece",
    currency: "EUR",
    rails: ["SEPA Instant", "SEPA Credit Transfer"],
    wallets: ["IRIS", "PayPal"],
  },
  {
    code: "CH",
    name: "Switzerland",
    currency: "CHF",
    rails: ["SIC", "TWINT"],
    wallets: ["TWINT", "PayPal"],
  },
  {
    code: "SE",
    name: "Sweden",
    currency: "SEK",
    rails: ["Swish", "Bankgirot"],
    wallets: ["Swish", "PayPal"],
  },
  {
    code: "NO",
    name: "Norway",
    currency: "NOK",
    rails: ["Vipps"],
    wallets: ["Vipps", "PayPal"],
  },
  {
    code: "DK",
    name: "Denmark",
    currency: "DKK",
    rails: ["MobilePay"],
    wallets: ["MobilePay", "PayPal"],
  },
  {
    code: "PL",
    name: "Poland",
    currency: "PLN",
    rails: ["Elixir", "BLIK"],
    wallets: ["BLIK", "PayPal"],
  },
  {
    code: "CZ",
    name: "Czechia",
    currency: "CZK",
    rails: ["CERTIS Instant"],
    wallets: ["PayPal", "Apple Pay"],
  },
  {
    code: "CA",
    name: "Canada",
    currency: "CAD",
    rails: ["Interac"],
    wallets: ["Interac e-Transfer", "PayPal"],
  },
  {
    code: "MX",
    name: "Mexico",
    currency: "MXN",
    rails: ["SPEI", "CoDi"],
    wallets: ["Mercado Pago", "Clip"],
  },
  {
    code: "BR",
    name: "Brazil",
    currency: "BRL",
    rails: ["Pix"],
    wallets: ["Pix", "Mercado Pago", "PicPay"],
  },
  {
    code: "AR",
    name: "Argentina",
    currency: "ARS",
    rails: ["Transferencias 3.0"],
    wallets: ["Mercado Pago", "Ualá"],
  },
  {
    code: "CL",
    name: "Chile",
    currency: "CLP",
    rails: ["TEF"],
    wallets: ["MACH", "Mercado Pago"],
  },
  {
    code: "CO",
    name: "Colombia",
    currency: "COP",
    rails: ["Bre-B", "TransfiYa"],
    wallets: ["Nequi", "Daviplata"],
  },
  {
    code: "PE",
    name: "Peru",
    currency: "PEN",
    rails: ["CCI"],
    wallets: ["Yape", "Plin"],
  },
  {
    code: "ZA",
    name: "South Africa",
    currency: "ZAR",
    rails: ["PayShap", "RTC"],
    wallets: ["SnapScan", "Zapper"],
  },
  {
    code: "AE",
    name: "UAE",
    currency: "AED",
    rails: ["Aani", "UAEIPP"],
    wallets: ["Apple Pay", "Samsung Pay"],
  },
  {
    code: "SA",
    name: "Saudi Arabia",
    currency: "SAR",
    rails: ["SARIE"],
    wallets: ["STC Pay", "Apple Pay"],
  },
  {
    code: "IL",
    name: "Israel",
    currency: "ILS",
    rails: ["ZAHAV", "FAST"],
    wallets: ["Bit", "PayBox"],
  },
  {
    code: "TR",
    name: "Türkiye",
    currency: "TRY",
    rails: ["FAST", "EFT"],
    wallets: ["Papara", "Paycell"],
  },
  {
    code: "LU",
    name: "Luxembourg",
    currency: "EUR",
    rails: ["SEPA Instant", "SEPA Credit Transfer"],
    wallets: ["PayPal", "Payconiq"],
  },
  {
    code: "SK",
    name: "Slovakia",
    currency: "EUR",
    rails: ["SEPA Instant", "SEPA Credit Transfer"],
    wallets: ["PayPal", "Apple Pay"],
  },
  {
    code: "SI",
    name: "Slovenia",
    currency: "EUR",
    rails: ["SEPA Instant", "SEPA Credit Transfer"],
    wallets: ["Flik", "PayPal"],
  },
  {
    code: "HR",
    name: "Croatia",
    currency: "EUR",
    rails: ["SEPA Instant", "SEPA Credit Transfer"],
    wallets: ["KEKS Pay", "PayPal"],
  },
  {
    code: "HU",
    name: "Hungary",
    currency: "HUF",
    rails: ["GIRO Instant", "SEPA"],
    wallets: ["SimplePay", "PayPal"],
  },
  {
    code: "RO",
    name: "Romania",
    currency: "RON",
    rails: ["SEPA Instant", "Transfond"],
    wallets: ["BT Pay", "PayPal"],
  },
  {
    code: "BG",
    name: "Bulgaria",
    currency: "BGN",
    rails: ["BISERA", "SEPA"],
    wallets: ["Revolut", "PayPal"],
  },
  {
    code: "LT",
    name: "Lithuania",
    currency: "EUR",
    rails: ["SEPA Instant", "SEPA Credit Transfer"],
    wallets: ["Paysera", "Revolut"],
  },
  {
    code: "LV",
    name: "Latvia",
    currency: "EUR",
    rails: ["SEPA Instant", "SEPA Credit Transfer"],
    wallets: ["Revolut", "PayPal"],
  },
  {
    code: "EE",
    name: "Estonia",
    currency: "EUR",
    rails: ["SEPA Instant", "SEPA Credit Transfer"],
    wallets: ["Revolut", "PayPal"],
  },
  {
    code: "MT",
    name: "Malta",
    currency: "EUR",
    rails: ["SEPA Instant", "SEPA Credit Transfer"],
    wallets: ["Revolut", "PayPal"],
  },
  {
    code: "CY",
    name: "Cyprus",
    currency: "EUR",
    rails: ["SEPA Instant", "SEPA Credit Transfer"],
    wallets: ["Revolut", "PayPal"],
  },
  {
    code: "EG",
    name: "Egypt",
    currency: "EGP",
    rails: ["InstaPay"],
    wallets: ["Vodafone Cash", "InstaPay"],
  },
  {
    code: "KE",
    name: "Kenya",
    currency: "KES",
    rails: ["PesaLink"],
    wallets: ["M-Pesa", "Airtel Money"],
  },
  {
    code: "NG",
    name: "Nigeria",
    currency: "NGN",
    rails: ["NIP"],
    wallets: ["Opay", "PalmPay"],
  },
  {
    code: "GH",
    name: "Ghana",
    currency: "GHS",
    rails: ["GhIPSS"],
    wallets: ["MTN MoMo", "Telecel Cash"],
  },
  {
    code: "MA",
    name: "Morocco",
    currency: "MAD",
    rails: ["Virement"],
    wallets: ["CashPlus", "Orange Money"],
  },
  {
    code: "QA",
    name: "Qatar",
    currency: "QAR",
    rails: ["QATCH"],
    wallets: ["NAPS", "Apple Pay"],
  },
  {
    code: "KW",
    name: "Kuwait",
    currency: "KWD",
    rails: ["KNET"],
    wallets: ["KNET", "Apple Pay"],
  },
  {
    code: "BH",
    name: "Bahrain",
    currency: "BHD",
    rails: ["Fawri+", "Benefit"],
    wallets: ["BenefitPay", "Apple Pay"],
  },
  {
    code: "OM",
    name: "Oman",
    currency: "OMR",
    rails: ["Ubar"],
    wallets: ["OmanNet", "Apple Pay"],
  },
  {
    code: "JO",
    name: "Jordan",
    currency: "JOD",
    rails: ["CliQ"],
    wallets: ["Dinarak", "Orange Money"],
  },
  {
    code: "KH",
    name: "Cambodia",
    currency: "KHR",
    rails: ["Bakong"],
    wallets: ["Wing", "ABA"],
  },
  {
    code: "LK",
    name: "Sri Lanka",
    currency: "LKR",
    rails: ["CEFTS", "LankaPay"],
    wallets: ["eZ Cash", "FriMi"],
  },
  {
    code: "BD",
    name: "Bangladesh",
    currency: "BDT",
    rails: ["NPSB"],
    wallets: ["bKash", "Nagad"],
  },
  {
    code: "PK",
    name: "Pakistan",
    currency: "PKR",
    rails: ["Raast"],
    wallets: ["JazzCash", "Easypaisa"],
  },
  {
    code: "NP",
    name: "Nepal",
    currency: "NPR",
    rails: ["connectIPS"],
    wallets: ["eSewa", "Khalti"],
  },
];

COUNTRIES.sort((a, b) => a.name.localeCompare(b.name));

export const countryByCode = (code: string): Country | undefined =>
  COUNTRIES.find((c) => c.code === code.toUpperCase());

export const currencyOf = (code: string): string =>
  countryByCode(code)?.currency ?? "USD";

export function flagFromCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
}

export const LOCAL_RAILS: Record<string, string> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c.rails[0]]),
);

export function railsFor(code: string): string[] {
  const c = countryByCode(code);
  return c ? [...c.rails] : ["Local instant rail"];
}

export function primaryRail(code: string): string {
  return railsFor(code)[0];
}

/** Map a stored/posted rail name onto the country's canonical list. */
export function canonicalizeRail(
  country: string,
  rail?: string | null,
): string | null {
  if (rail == null || String(rail).trim() === "") return null;
  const rails = railsFor(country);
  const want = String(rail).trim().toLowerCase();
  return rails.find((r) => r.toLowerCase() === want) ?? null;
}

export type LinkedRailAlias = { railType: string; alias: string };

/** Saved-people id for the signed-in user's own payment methods. */
export const ME_CONTACT_ID = "ppl-me";

const ALIAS_HINTS: Record<string, string> = {
  PayNow: "Mobile number (+65…)",
  FAST: "Bank account number",
  PromptPay: "Mobile number or national ID",
  Zelle: "Email or US mobile number",
  FedNow: "Bank account number",
  ACH: "Routing and account number",
  "SEPA Instant": "IBAN",
  "SEPA Credit Transfer": "IBAN",
  UPI: "UPI ID (name@bank)",
  IMPS: "Account number and IFSC",
  Pix: "CPF, email, phone, or Pix key",
  DuitNow: "Mobile number or DuitNow ID",
  QRIS: "Merchant or account ID",
  "BI-FAST": "Bank account number",
  InstaPay: "Mobile number or account",
  PESONet: "Bank account number",
  FPS: "Mobile number, email, or FPS ID",
  PayID: "PayID email or phone",
  NPP: "PayID or account number",
  PayTo: "Account number",
  Fawri: "IBAN or mobile",
  "Fawri+": "IBAN or mobile",
};

/** Placeholder for the ID a sender needs on this rail. */
export function aliasHint(rail: string): string {
  if (ALIAS_HINTS[rail]) return ALIAS_HINTS[rail];
  const r = rail.toLowerCase();
  if (r.includes("sepa") || r.includes("iban") || r.includes("fawri"))
    return "IBAN";
  if (r.includes("upi")) return "UPI ID (name@bank)";
  if (
    /zelle|venmo|paypal|paynow|promptpay|duitnow|fps|payid|pix|instapay|raast|gcash/.test(
      r,
    )
  ) {
    return "Mobile number, email, or handle";
  }
  return `${rail} account or ID`;
}

/**
 * Keep only rails that exist in `country`. If `remap` and none survive
 * (e.g. PayNow after a move to Bahrain), attach the new country's primary rail
 * so "has an account" still means has an account, not a leftover foreign rail.
 */
export function alignRailsToCountry(
  country: string,
  aliases: LinkedRailAlias[] | undefined,
  remap = false,
): LinkedRailAlias[] {
  const list = Array.isArray(aliases) ? aliases : [];
  const valid: LinkedRailAlias[] = [];
  for (const a of list) {
    if (!a || typeof a.railType !== "string") continue;
    const rail = canonicalizeRail(country, a.railType);
    if (rail) valid.push({ railType: rail, alias: a.alias ?? "" });
  }
  if (valid.length) return valid;
  if (remap && list.length) {
    return [{ railType: primaryRail(country), alias: list[0]?.alias ?? "" }];
  }
  return [];
}

export function hasUsableAccount(
  country: string,
  aliases: { railType: string }[] | undefined,
): boolean {
  return !!aliases?.some((a) => canonicalizeRail(country, a.railType));
}

/** Canonicalize a posted list of rails; reject anything that does not exist in `country`. */
export function normalizeLinkedRails(
  country: string,
  aliases: LinkedRailAlias[] | undefined,
): { error: string } | { linkedRailAliases: LinkedRailAlias[] } {
  const list = Array.isArray(aliases) ? aliases : [];
  const out: LinkedRailAlias[] = [];
  const seen = new Set<string>();
  for (const a of list) {
    if (!a || typeof a.railType !== "string") continue;
    const rail = canonicalizeRail(country, a.railType);
    if (!rail) {
      return {
        error: `${String(a.railType).trim() || "That rail"} is not a settlement rail in ${country}.`,
      };
    }
    if (seen.has(rail)) continue;
    seen.add(rail);
    out.push({
      railType: rail,
      alias: String(a.alias ?? "")
        .trim()
        .slice(0, 80),
    });
  }
  return { linkedRailAliases: out };
}

/** Resolve linked rails for a traveler PATCH (country and/or railType). */
export function linkedAliasesFromUpdate(
  existing: { country: string; linkedRailAliases: LinkedRailAlias[] },
  body: {
    country?: string;
    railType?: string | null;
    alias?: string;
    linkedRailAliases?: LinkedRailAlias[] | null;
  },
): { error: string } | { linkedRailAliases?: LinkedRailAlias[] } {
  const nextCountry = body.country ?? existing.country;
  const countryChanged =
    body.country !== undefined && body.country !== existing.country;

  if (body.linkedRailAliases !== undefined) {
    if (body.linkedRailAliases == null) {
      return { linkedRailAliases: [] };
    }
    const normalized = normalizeLinkedRails(
      nextCountry,
      body.linkedRailAliases,
    );
    if ("error" in normalized) {
      if (!countryChanged) return normalized;
      return {
        linkedRailAliases: alignRailsToCountry(
          nextCountry,
          body.linkedRailAliases,
          true,
        ),
      };
    }
    return normalized;
  }

  if (body.railType !== undefined) {
    if (body.railType == null || !String(body.railType).trim()) {
      return { linkedRailAliases: [] };
    }
    let rail = canonicalizeRail(nextCountry, body.railType);
    if (!rail) {
      if (!countryChanged) return { error: "Unsupported settlement rail." };
      rail = primaryRail(nextCountry);
    }
    return {
      linkedRailAliases: [
        {
          railType: rail,
          alias: body.alias || existing.linkedRailAliases[0]?.alias || "",
        },
      ],
    };
  }
  if (countryChanged && existing.linkedRailAliases[0]) {
    return {
      linkedRailAliases: alignRailsToCountry(
        nextCountry,
        existing.linkedRailAliases,
        true,
      ),
    };
  }
  return {};
}

/** Claim-link payout methods for a recipient's country. */
export function payoutOptionsFor(country: string): string[] {
  const c = countryByCode(country);
  const opts: string[] = [];
  if (c) {
    opts.push(`Bank transfer via ${c.rails[0]} (${c.currency})`);
    for (const w of c.wallets) {
      if (!opts.some((o) => o.toLowerCase() === w.toLowerCase())) {
        opts.push(w);
      }
    }
  } else {
    opts.push("Local bank transfer (provide IBAN / account no.)");
    opts.push("E-wallet (GrabPay, TrueMoney, Alipay, etc.)");
  }
  opts.push("Cash pickup at Western Union / MoneyGram agent");
  opts.push("Donate to charity");
  return opts;
}

// Static baseline FX (1 unit of currency = X USD). Overridden by live
// rates at boot where available.
export const STATIC_FX: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  JPY: 0.0067,
  SGD: 0.74,
  THB: 0.028,
  AUD: 0.65,
  CAD: 0.72,
  CHF: 1.11,
  CNY: 0.14,
  HKD: 0.128,
  INR: 0.012,
  IDR: 0.000062,
  MYR: 0.21,
  PHP: 0.017,
  VND: 0.000039,
  KRW: 0.00072,
  TWD: 0.031,
  AED: 0.27,
  SAR: 0.27,
  ZAR: 0.055,
  BRL: 0.18,
  MXN: 0.05,
  ARS: 0.0011,
  CLP: 0.00105,
  COP: 0.00025,
  PEN: 0.26,
  NZD: 0.6,
  SEK: 0.093,
  NOK: 0.092,
  DKK: 0.145,
  PLN: 0.25,
  CZK: 0.043,
  TRY: 0.03,
  ILS: 0.27,
  HUF: 0.0028,
  RON: 0.22,
  BGN: 0.55,
  EGP: 0.021,
  KES: 0.0077,
  NGN: 0.00065,
  MAD: 0.1,
  QAR: 0.27,
  KHR: 0.00024,
  LKR: 0.0033,
  BDT: 0.0082,
  PKR: 0.0036,
  NPR: 0.0074,
  GHS: 0.064,
  KWD: 3.25,
  BHD: 2.65,
  OMR: 2.6,
  JOD: 1.41,
};

// Euro + SEPA/EEA countries we support: they settle as local SEPA Instant
// even when ISO country codes differ.
export const SEPA_COUNTRIES = new Set([
  "DE",
  "FR",
  "ES",
  "IT",
  "NL",
  "PT",
  "IE",
  "AT",
  "BE",
  "FI",
  "GR",
  "PL",
  "CZ",
  "SE",
  "DK",
  "NO",
  "LU",
  "SK",
  "SI",
  "HR",
  "HU",
  "RO",
  "BG",
  "LT",
  "LV",
  "EE",
  "MT",
  "CY",
]);

/** Local/union rail name if these two countries can settle as "local". */
export function sharedLocalRail(a: string, b: string): string | undefined {
  if (a === b) return LOCAL_RAILS[a] ?? "Local instant rail";
  if (SEPA_COUNTRIES.has(a) && SEPA_COUNTRIES.has(b)) return "SEPA Instant";
  return undefined;
}

// Bilateral instant-payment linkages (sorted "A-B" key).
export const LINKED_CORRIDORS: Record<string, string> = {
  "SG-TH": "PayNow ↔ PromptPay",
  "MY-SG": "DuitNow ↔ PayNow",
  "MY-TH": "DuitNow ↔ PromptPay",
  "IN-SG": "UPI ↔ PayNow",
  "ID-SG": "QRIS ↔ PayNow",
  "ID-MY": "QRIS ↔ DuitNow",
  "ID-TH": "QRIS ↔ PromptPay",
  "PH-SG": "InstaPay ↔ PayNow",
  "MY-PH": "InstaPay ↔ DuitNow",
  "PH-TH": "InstaPay ↔ PromptPay",
  "HK-SG": "FPS ↔ PayNow",
  "HK-TH": "FPS ↔ PromptPay",
  "AU-SG": "NPP ↔ PayNow",
  "AE-IN": "Aani ↔ UPI",
  "KH-TH": "Bakong ↔ PromptPay",
  "KH-SG": "Bakong ↔ PayNow",
  "TH-VN": "VietQR ↔ PromptPay",
  "SG-VN": "VietQR ↔ PayNow",
};

export const linkedKey = (a: string, b: string): string =>
  [a, b].sort().join("-");
