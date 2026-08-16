import assert from "node:assert/strict";
import { test } from "node:test";
import { cheapestRail } from "./railOptions.js";
import {
  COUNTRIES,
  LOCAL_RAILS,
  LINKED_CORRIDORS,
  SEPA_COUNTRIES,
  STATIC_FX,
  flagFromCode,
  linkedKey,
  payoutOptionsFor,
  primaryRail,
  railsFor,
  canonicalizeRail,
} from "./countries.js";
import { CORRIDOR_LIMITS, FX_TABLE } from "../types.js";

test("every country has a named domestic rail, wallets, and FX rate", () => {
  assert.ok(COUNTRIES.length >= 65);
  const codes = COUNTRIES.map((c) => c.code);
  assert.equal(new Set(codes).size, codes.length, "duplicate country codes");
  for (const c of COUNTRIES) {
    assert.equal(c.code.length, 2);
    assert.ok(c.rails.length > 0, `${c.code} missing rails`);
    assert.notEqual(
      c.rails[0],
      "Local instant rail",
      `${c.code} still using generic rail`,
    );
    assert.ok(c.wallets.length > 0, `${c.code} missing wallets`);
    assert.ok(
      STATIC_FX[c.currency] > 0,
      `${c.code} currency ${c.currency} missing FX`,
    );
    assert.equal(LOCAL_RAILS[c.code], c.rails[0]);
    assert.ok(
      CORRIDOR_LIMITS[`${c.code}->${c.code}`] > 0,
      `${c.code} missing domestic corridor limit`,
    );
    const flag = flagFromCode(c.code);
    assert.equal([...flag].length, 2, `${c.code} flag`);
  }
});

test("same-country settlement uses that country's primary rail, not USDC", () => {
  for (const c of COUNTRIES) {
    const pick = cheapestRail(c.code, c.code, true);
    assert.equal(pick.type, "local", `${c.code} should settle locally`);
    assert.equal(pick.railName, primaryRail(c.code));
    assert.equal(pick.feeEstimatePct, 0);
  }
});

test("Singapore claim payouts include PayNow and a local wallet", () => {
  const opts = payoutOptionsFor("SG");
  assert.ok(opts.some((o) => /PayNow/i.test(o)));
  assert.ok(opts.includes("GrabPay"));
  assert.ok(opts.some((o) => /charity/i.test(o)));
});

test("Indonesia→Singapore uses the QRIS ↔ PayNow linked rail", () => {
  const pick = cheapestRail("ID", "SG", true);
  assert.equal(pick.type, "linked");
  assert.equal(pick.railName, LINKED_CORRIDORS["ID-SG"]);
});

test("canonicalizeRail maps aliases onto the country's list", () => {
  assert.equal(canonicalizeRail("US", "zelle"), "Zelle");
  assert.equal(canonicalizeRail("SG", "paynow"), "PayNow");
  assert.equal(canonicalizeRail("TH", "garbage"), "PromptPay");
  assert.equal(canonicalizeRail("US", null), null);
});

test("railsFor matches the country record", () => {
  assert.deepEqual(railsFor("BR"), ["Pix"]);
  assert.deepEqual(railsFor("PT"), ["SEPA Instant", "SEPA Credit Transfer"]);
});

test("FX table is seeded for every listed currency", () => {
  const currencies = new Set(COUNTRIES.map((c) => c.currency));
  for (const cur of currencies) {
    assert.equal(FX_TABLE[cur], STATIC_FX[cur]);
  }
});

test("every country pair with accounts routes to a named local, linked, or USDC rail", () => {
  const codes = COUNTRIES.map((c) => c.code);
  for (const a of codes) {
    for (const b of codes) {
      const pick = cheapestRail(a, b, true);
      assert.ok(
        pick.type === "local" ||
          pick.type === "linked" ||
          pick.type === "stable_bridge",
        `${a}→${b} got ${pick.type}`,
      );
      assert.ok(pick.railName.length > 0, `${a}→${b} missing rail name`);
      const none = cheapestRail(a, b, false);
      assert.equal(none.type, "claim_link", `${a}→${b} no-account`);
    }
  }
});

test("SEPA countries settle as local even when ISO codes differ", () => {
  for (const a of SEPA_COUNTRIES) {
    assert.ok(
      COUNTRIES.some((c) => c.code === a),
      `SEPA ${a} is not in COUNTRIES`,
    );
    for (const b of SEPA_COUNTRIES) {
      if (a === b) continue;
      const pick = cheapestRail(a, b, true);
      assert.equal(pick.type, "local", `${a}→${b} should be SEPA`);
      assert.equal(pick.railName, "SEPA Instant");
    }
  }
});

test("linked corridor keys are sorted and both countries exist", () => {
  const known = new Set(COUNTRIES.map((c) => c.code));
  for (const [key, name] of Object.entries(LINKED_CORRIDORS)) {
    const [a, b] = key.split("-");
    assert.equal(key, linkedKey(a, b), `${key} is not sorted`);
    assert.ok(known.has(a) && known.has(b), `${key} has unknown country`);
    assert.ok(name.includes("↔"), `${key} rail name: ${name}`);
    const pick = cheapestRail(a, b, true);
    assert.equal(pick.type, "linked", `${key} should be linked`);
    assert.equal(pick.railName, name);
  }
});

test("new travel corridors: Egypt payout, Kenya local, Cambodia↔Singapore linked", () => {
  assert.ok(payoutOptionsFor("EG").some((o) => /InstaPay/i.test(o)));
  assert.equal(cheapestRail("KE", "KE", true).railName, "PesaLink");
  assert.equal(cheapestRail("NG", "NG", true).railName, "NIP");
  assert.equal(cheapestRail("SA", "SA", true).railName, "SARIE");
  assert.equal(cheapestRail("NZ", "NZ", true).railName, "PayTo");
  const khSg = cheapestRail("KH", "SG", true);
  assert.equal(khSg.type, "linked");
  assert.equal(khSg.railName, "Bakong ↔ PayNow");
});

test("country list is sorted by name for the picker", () => {
  const names = COUNTRIES.map((c) => c.name);
  assert.deepEqual(
    names,
    [...names].sort((a, b) => a.localeCompare(b)),
  );
});
