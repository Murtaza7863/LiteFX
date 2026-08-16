// Broad country base (mirrors backend) so the UI renders flags/names
// and the forms offer real local payment methods, not a generic fallback.
export interface Country {
  code: string;
  name: string;
  currency: string;
  rails: string[];
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
    rails: ["SBI"],
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
    rails: ["sarie"],
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
];

export const CURRENCY_OPTIONS = Array.from(
  new Set(COUNTRIES.map((c) => c.currency)),
);

export const flagFromCode = (code: string): string =>
  code
    .toUpperCase()
    .replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));

export const railsFor = (code: string): string[] => {
  const c = COUNTRIES.find((x) => x.code === code.toUpperCase());
  return c ? [...c.rails] : ["Local instant rail", "Bank transfer (SWIFT)"];
};

export const primaryRail = (code: string): string => railsFor(code)[0];
