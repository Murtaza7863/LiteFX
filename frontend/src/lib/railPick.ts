import { primaryRail, railsFor } from "./countries";

/** Rail to submit when the country picker and rail dropdown can disagree. */
export function railForCountry(country: string, stored?: string): string {
  const rails = railsFor(country);
  if (stored) {
    const match = rails.find((r) => r.toLowerCase() === stored.toLowerCase());
    if (match) return match;
  }
  return rails[0] ?? primaryRail(country);
}
