import assert from "node:assert/strict";
import { test } from "node:test";
import { COUNTRIES, railsFor } from "./countries.ts";
import { countryToCommit, filterCountries } from "./countryQuery.ts";
import { railForCountry } from "./railPick.ts";

test("typing each country's name or code commits that country", () => {
  for (const c of COUNTRIES) {
    const byName = filterCountries(c.name);
    assert.equal(countryToCommit(c.name, byName, 0), c.code, c.name);
    const byCode = filterCountries(c.code);
    assert.equal(countryToCommit(c.code, byCode, 0), c.code, c.code);
    const byLower = filterCountries(c.code.toLowerCase());
    assert.equal(
      countryToCommit(c.code.toLowerCase(), byLower, 0),
      c.code,
      c.code,
    );
  }
});

test("highlighting a country with an empty query still commits that row", () => {
  const jp = COUNTRIES.findIndex((c) => c.code === "JP");
  assert.ok(jp >= 0);
  assert.equal(countryToCommit("", COUNTRIES, jp), "JP");
  assert.equal(countryToCommit("   ", COUNTRIES, jp), "JP");
  assert.equal(countryToCommit("zzzz-no-country", [], 0), null);
});

test("a leftover rail from any country maps onto a real rail of the destination", () => {
  for (const from of COUNTRIES) {
    for (const leftover of railsFor(from.code)) {
      for (const to of COUNTRIES) {
        const picked = railForCountry(to.code, leftover);
        assert.ok(
          railsFor(to.code).includes(picked),
          `${from.code} ${leftover} → ${to.code} got ${picked}`,
        );
      }
    }
  }
});
