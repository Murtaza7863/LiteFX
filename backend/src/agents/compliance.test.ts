import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { FREQUENCY_THRESHOLD } from "../types.js";
import { clearStore, getStore } from "../store.js";
import { traveler } from "../testUtil.js";
import { evaluateCompliance, runCompliance } from "./compliance.js";

afterEach(() => {
  clearStore();
});

test("amounts above the US→DE corridor limit are flagged", () => {
  const st = getStore();
  st.entities = [
    traveler("us", "US person", "US", "zelle"),
    traveler("de", "DE person", "DE", "sepa"),
  ];
  st.netObligations = [
    {
      id: "net-1",
      from: "us",
      to: "de",
      amount: 400,
      settlementCurrency: "EUR",
      amountUsd: 400,
      status: "pending",
    },
  ];
  const flags = evaluateCompliance();
  assert.equal(flags.length, 1);
  assert.equal(flags[0].type, "limit_exceeded");
  assert.equal(
    getStore().netObligations[0].complianceFlags?.[0].type,
    "limit_exceeded",
  );
});

test("the same pair netting more than the frequency threshold is flagged", () => {
  const st = getStore();
  st.entities = [
    traveler("a", "A", "SG", "paynow"),
    traveler("b", "B", "SG", "paynow"),
  ];
  st.netObligations = Array.from(
    { length: FREQUENCY_THRESHOLD + 1 },
    (_, i) => ({
      id: `net-${i}`,
      from: "a",
      to: "b",
      amount: 10,
      settlementCurrency: "SGD",
      amountUsd: 10,
      status: "pending",
    }),
  );
  const flags = evaluateCompliance();
  assert.ok(flags.some((f) => f.type === "frequency_anomaly"));
  assert.equal(
    flags.filter((f) => f.type === "frequency_anomaly").length,
    1,
    "only the obligation that crosses the threshold is flagged",
  );
});

test("runCompliance records that the step ran even when clear", () => {
  const flags = runCompliance();
  assert.deepEqual(flags, []);
  assert.equal(getStore().complianceRan, true);
});

test("amounts under the corridor limit are not flagged", () => {
  const st = getStore();
  st.entities = [
    traveler("us", "US person", "US", "zelle"),
    traveler("de", "DE person", "DE", "sepa"),
  ];
  st.netObligations = [
    {
      id: "net-1",
      from: "us",
      to: "de",
      amount: 200,
      settlementCurrency: "EUR",
      amountUsd: 200,
      status: "pending",
    },
  ];
  assert.deepEqual(evaluateCompliance(), []);
});

test("frequency counts an unordered pair, not each direction separately", () => {
  const st = getStore();
  st.entities = [
    traveler("a", "A", "SG", "paynow"),
    traveler("b", "B", "SG", "paynow"),
  ];
  st.netObligations = [
    ...Array.from({ length: FREQUENCY_THRESHOLD }, (_, i) => ({
      id: `ab-${i}`,
      from: "a",
      to: "b",
      amount: 10,
      settlementCurrency: "SGD",
      amountUsd: 10,
      status: "pending" as const,
    })),
    {
      id: "ba-1",
      from: "b",
      to: "a",
      amount: 10,
      settlementCurrency: "SGD",
      amountUsd: 10,
      status: "pending",
    },
  ];
  const flags = evaluateCompliance();
  assert.ok(
    flags.some(
      (f) => f.obligationId === "ba-1" && f.type === "frequency_anomaly",
    ),
  );
});
