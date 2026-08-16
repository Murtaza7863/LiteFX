import assert from "node:assert/strict";
import { test } from "node:test";
import { formatUsdPerUnit, roundUsdPerUnit } from "./fx.js";
import { fromUsd, toUsd } from "./types.js";

test("USD is a 1:1 reference", () => {
  assert.equal(toUsd(42.5, "USD"), 42.5);
  assert.equal(fromUsd(42.5, "USD"), 42.5);
});

test("unknown currencies fall back to 1.0 instead of throwing", () => {
  assert.equal(toUsd(10, "XYZ"), 10);
  assert.equal(fromUsd(10, "XYZ"), 10);
});

test("toUsd and fromUsd round-trip within a cent for SGD", () => {
  const usd = toUsd(100, "SGD");
  const back = fromUsd(usd, "SGD");
  assert.ok(Math.abs(back - 100) <= 0.02);
});

test("weak currencies keep enough USD precision to round-trip typical amounts", () => {
  const idr = toUsd(1_000_000, "IDR");
  assert.ok(idr > 50 && idr < 80, `IDR USD was ${idr}`);
  assert.ok(Math.abs(fromUsd(idr, "IDR") - 1_000_000) / 1_000_000 < 0.01);

  const vnd = toUsd(2_000_000, "VND");
  assert.ok(vnd > 60 && vnd < 100, `VND USD was ${vnd}`);
  assert.ok(Math.abs(fromUsd(vnd, "VND") - 2_000_000) / 2_000_000 < 0.01);

  const kes = toUsd(10_000, "KES");
  assert.ok(Math.abs(fromUsd(kes, "KES") - 10_000) / 10_000 < 0.02);
});

test("formatUsdPerUnit keeps digits for IDR-scale rates", () => {
  assert.equal(formatUsdPerUnit(0.74), "0.74");
  assert.match(formatUsdPerUnit(0.000062), /0\.000062/);
  assert.equal(roundUsdPerUnit(0.0000625), 0.0000625);
});
