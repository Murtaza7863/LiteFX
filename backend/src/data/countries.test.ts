import assert from "node:assert/strict";
import { test } from "node:test";
import { cheapestRail } from "./railOptions.js";
import {
  COUNTRIES,
  LOCAL_RAILS,
  LINKED_CORRIDORS,
  STATIC_FX,
  payoutOptionsFor,
  primaryRail,
  railsFor,
} from "./countries.js";
import { CORRIDOR_LIMITS, FX_TABLE } from "../types.js";

test("every country has a named domestic rail, wallets, and FX rate", () => {
  assert.ok(COUNTRIES.length >= 40);
  for (const c of COUNTRIES) {
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
