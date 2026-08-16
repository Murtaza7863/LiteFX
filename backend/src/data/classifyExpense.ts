export const EXPENSE_CATEGORY_IDS = [
  "food",
  "accommodation",
  "transport",
  "activities",
  "general",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORY_IDS)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food: "Food",
  accommodation: "Stay",
  transport: "Transport",
  activities: "Activities",
  general: "General",
};

export interface ExpenseGuess {
  category: ExpenseCategory;
  label: string;
  matched: string | null;
  score: number;
  partial: boolean;
}

type Weighted = { phrase: string; weight: number };

function w(phrase: string, weight?: number): Weighted {
  return { phrase, weight: weight ?? Math.max(4, phrase.length) };
}

const LEXICON: Record<Exclude<ExpenseCategory, "general">, Weighted[]> = {
  food: [
    w("jay fai", 14),
    w("food court", 12),
    w("street food", 13),
    w("night market", 11),
    w("uber eats", 16),
    w("grab food", 16),
    w("hot pot", 12),
    w("hotpot", 12),
    w("bubble tea", 11),
    w("pad thai", 12),
    w("ice cream", 10),
    w("breakfast", 12),
    w("restaurant", 12),
    w("groceries", 12),
    w("supermarket", 12),
    w("cocktails", 12),
    w("cocktail", 11),
    w("dinner", 12),
    w("lunch", 11),
    w("brunch", 11),
    w("hawker", 10),
    w("noodles", 9),
    w("grocery", 10),
    w("dessert", 8),
    w("drinks", 10),
    w("drink", 8),
    w("coffee", 9),
    w("bistro", 8),
    w("pizza", 8),
    w("burger", 8),
    w("ramen", 8),
    w("sushi", 8),
    w("snacks", 7),
    w("snack", 6),
    w("meals", 8),
    w("meal", 7),
    w("resto", 7),
    w("diner", 7),
    w("grill", 6),
    w("cafe", 7),
    w("café", 7),
    w("beer", 7),
    w("wine", 7),
    w("sake", 6),
    w("bar", 7),
    w("pub", 6),
    w("tea", 5),
    w("food", 8),
    w("bbq", 7),
    w("boba", 8),
  ],
  accommodation: [
    w("airbnb", 14),
    w("air bnb", 14),
    w("booking.com", 12),
    w("accommodation", 12),
    w("accomodation", 12),
    w("homestay", 11),
    w("night stay", 12),
    w("hostel", 13),
    w("hotel", 14),
    w("resort", 12),
    w("lodging", 11),
    w("motel", 11),
    w("villa", 10),
    w("nights", 10),
    w("apartment", 8),
    w("condo", 7),
    w("agoda", 8),
    w("room", 5),
  ],
  transport: [
    w("rental car", 14),
    w("car rental", 14),
    w("tuk tuk", 12),
    w("tuktuk", 12),
    w("airfare", 12),
    w("airline", 11),
    w("flights", 13),
    w("flight", 12),
    w("airport", 8),
    w("shuttle", 10),
    w("parking", 9),
    w("petrol", 9),
    w("rideshare", 12),
    w("ride share", 12),
    w("gojek", 11),
    w("taxis", 12),
    w("taxi", 12),
    w("uber", 12),
    w("grab", 12),
    w("lyft", 11),
    w("bolt", 10),
    w("train", 10),
    w("ferry", 10),
    w("metro", 9),
    w("subway", 9),
    w("coach", 8),
    w("fuel", 8),
    w("tolls", 8),
    w("toll", 7),
    w("van", 8),
    w("bus", 8),
    w("cab", 9),
    w("mrt", 8),
    w("bts", 8),
    w("gas", 5),
    w("rental", 8),
    w("transport", 9),
    w("transfer", 7),
    w("boat", 8),
  ],
  activities: [
    w("cooking class", 14),
    w("escape room", 14),
    w("theme park", 13),
    w("snorkeling", 12),
    w("snorkel", 11),
    w("nightlife", 10),
    w("attraction", 10),
    w("activities", 10),
    w("activity", 9),
    w("karaoke", 10),
    w("massage", 12),
    w("museum", 11),
    w("temple", 11),
    w("concert", 11),
    w("tickets", 10),
    w("ticket", 9),
    w("diving", 11),
    w("island", 9),
    w("hiking", 10),
    w("tours", 11),
    w("tour", 11),
    w("show", 8),
    w("park", 6),
    w("zoo", 8),
    w("spa", 12),
    w("surf", 8),
    w("trek", 8),
    w("club", 6),
  ],
};

export function isExpenseCategory(value: string): value is ExpenseCategory {
  return (EXPENSE_CATEGORY_IDS as readonly string[]).includes(value);
}

export function normalizeExpenseName(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function padded(s: string): string {
  return ` ${s} `;
}

const RIDE_HAIL = new Set(["grab", "uber", "gojek", "lyft", "bolt"]);
const PREFIX_MIN = 3;

function earlyBoost(text: string, phrase: string): number {
  const words = text.split(" ").filter(Boolean).slice(0, 2);
  return padded(words.join(" ")).includes(padded(phrase)) ? 8 : 0;
}

function prefixStems(text: string): string[] {
  const tokens = text.split(" ").filter(Boolean);
  const stems: string[] = [];
  for (const token of tokens) {
    if (token.length >= PREFIX_MIN) stems.push(token);
  }
  if (tokens.length >= 2) {
    const two = `${tokens[tokens.length - 2]} ${tokens[tokens.length - 1]}`;
    if (two.length >= PREFIX_MIN) stems.push(two);
  }
  return stems;
}

function emptyGuess(): ExpenseGuess {
  return {
    category: "general",
    label: EXPENSE_CATEGORY_LABELS.general,
    matched: null,
    score: 0,
    partial: false,
  };
}

type Named = Exclude<ExpenseCategory, "general">;

export function classifyExpense(name: string): ExpenseGuess {
  const text = normalizeExpenseName(name);
  if (!text) return emptyGuess();

  const hay = padded(text);
  const scores: Record<Named, number> = {
    food: 0,
    accommodation: 0,
    transport: 0,
    activities: 0,
  };
  const hits: Record<Named, string | null> = {
    food: null,
    accommodation: null,
    transport: null,
    activities: null,
  };
  const exactPhrases: Record<Named, string[]> = {
    food: [],
    accommodation: [],
    transport: [],
    activities: [],
  };
  let usedPrefix = false;

  const noteHit = (
    category: Named,
    phrase: string,
    add: number,
    exact: boolean,
  ) => {
    scores[category] += add;
    if (!hits[category] || phrase.length > (hits[category]?.length ?? 0)) {
      hits[category] = phrase;
    }
    if (exact) exactPhrases[category].push(normalizeExpenseName(phrase));
  };

  for (const category of Object.keys(LEXICON) as Named[]) {
    for (const { phrase, weight } of LEXICON[category]) {
      const normalized = normalizeExpenseName(phrase);
      if (!hay.includes(padded(normalized))) continue;
      noteHit(category, phrase, weight + earlyBoost(text, normalized), true);
    }
  }

  if (scores.food > 0 && exactPhrases.transport.length > 0) {
    const onlyHail = exactPhrases.transport.every((p) => RIDE_HAIL.has(p));
    if (onlyHail) {
      scores.transport = 0;
      hits.transport = null;
    }
  }

  if (Math.max(...Object.values(scores)) === 0) {
    const stems = prefixStems(text);
    const prefixAdds: { category: Named; phrase: string; weight: number }[] =
      [];
    for (const stem of stems) {
      const found: { category: Named; phrase: string; weight: number }[] = [];
      for (const category of Object.keys(LEXICON) as Named[]) {
        for (const { phrase, weight } of LEXICON[category]) {
          const normalized = normalizeExpenseName(phrase);
          if (normalized === stem) continue;
          const multi = normalized.includes(" ");
          const matches = multi
            ? stem.includes(" ") && normalized.startsWith(stem)
            : normalized.startsWith(stem);
          if (!matches) continue;
          found.push({ category, phrase, weight });
        }
      }
      const cats = new Set(found.map((f) => f.category));
      if (cats.size !== 1) continue;
      found.sort((a, b) => a.phrase.length - b.phrase.length);
      prefixAdds.push(found[0]);
    }
    const prefixCats = new Set(prefixAdds.map((p) => p.category));
    if (prefixCats.size === 1) {
      usedPrefix = true;
      for (const hit of prefixAdds) {
        noteHit(hit.category, hit.phrase, Math.round(hit.weight * 0.75), false);
      }
    }
  }

  let best: Named = "food";
  let bestScore = 0;
  for (const category of [
    "accommodation",
    "transport",
    "food",
    "activities",
  ] as const) {
    if (scores[category] > bestScore) {
      best = category;
      bestScore = scores[category];
    }
  }

  if (bestScore === 0) return emptyGuess();
  return {
    category: best,
    label: EXPENSE_CATEGORY_LABELS[best],
    matched: hits[best],
    score: bestScore,
    partial: usedPrefix,
  };
}
