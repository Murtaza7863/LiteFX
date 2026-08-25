import { COUNTRIES } from "./countries";

export function filterCountries(query: string): typeof COUNTRIES {
  const q = query.trim().toLowerCase();
  if (!q) return COUNTRIES;
  const scored: { c: (typeof COUNTRIES)[number]; score: number }[] = [];
  for (const c of COUNTRIES) {
    const name = c.name.toLowerCase();
    const code = c.code.toLowerCase();
    const currency = c.currency.toLowerCase();
    let score = -1;
    if (code === q) score = 0;
    else if (name === q) score = 1;
    else if (name.startsWith(q) || code.startsWith(q)) score = 2;
    else if (currency === q) score = 3;
    else if (name.includes(q) || code.includes(q) || currency.includes(q))
      score = 4;
    if (score >= 0) scored.push({ c, score });
  }
  scored.sort((a, b) => a.score - b.score || a.c.name.localeCompare(b.c.name));
  return scored.map((x) => x.c);
}

/** Highlighted country in the open picker — including when the query is empty. */
export function countryToCommit(
  _query: string,
  matches: { code: string }[],
  active: number,
): string | null {
  return matches[active]?.code ?? null;
}

/**
 * Closed picker: keep the current country. Open picker with nothing typed and
 * no current country: do not fall through to the first row (Argentina).
 */
export function commitCountrySelection(opts: {
  open: boolean;
  query: string;
  current: string;
  matches: { code: string }[];
  active: number;
}): string | null {
  if (!opts.open) return opts.current || null;
  if (!opts.query.trim() && !opts.current) return null;
  return countryToCommit(opts.query, opts.matches, opts.active);
}
