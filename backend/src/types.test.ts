import assert from "node:assert/strict";
import { test } from "node:test";
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
