import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { clearStore, getStore, seedStore } from "../store.js";
import { traveler } from "../testUtil.js";
import { runNetting } from "./netting.js";
import { runReconciliation } from "./reconciliation.js";

afterEach(() => {
  clearStore();
});

test("sample invoices match the netted creditors", () => {
  seedStore();
  runNetting();
  const results = runReconciliation();
  assert.ok(results.length > 0);
  assert.ok(results.every((r) => r.status !== "unmatched"));
  assert.equal(getStore().reconciliationRan, true);
  assert.ok(getStore().vendorSummary.length > 0);
});

test("an invoice with no matching creditor is unmatched", () => {
  const st = getStore();
  st.entities = [traveler("a", "A", "US", "zelle")];
  st.invoices = [
    {
      id: "inv-x",
      vendorId: "nobody",
      vendorName: "Ghost",
      amount: 10,
      currency: "USD",
      bookingRef: "GHOST",
      status: "open",
    },
  ];
  const results = runReconciliation();
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "unmatched");
});

test("invoice amount off by more than $1 is a mismatch", () => {
  const st = getStore();
  st.entities = [
    traveler("a", "A", "US", "zelle"),
    traveler("b", "B", "US", "zelle"),
  ];
  st.netObligations = [
    {
      id: "net-1",
      from: "a",
      to: "b",
      amount: 50,
      settlementCurrency: "USD",
      amountUsd: 50,
      status: "pending",
    },
  ];
  st.invoices = [
    {
      id: "inv-1",
      vendorId: "b",
      vendorName: "B",
      amount: 80,
      currency: "USD",
      bookingRef: "OFF",
      status: "open",
    },
  ];
  const results = runReconciliation();
  assert.equal(results[0].status, "mismatch");
});

test("custom trips with no invoices get auto bills per creditor", () => {
  const st = getStore();
  st.entities = [
    traveler("a", "Alice", "US", "zelle"),
    traveler("b", "Bob", "US", "zelle"),
  ];
  st.netObligations = [
    {
      id: "net-1",
      from: "a",
      to: "b",
      amount: 20,
      settlementCurrency: "USD",
      amountUsd: 20,
      status: "pending",
    },
  ];
  assert.equal(st.invoices.length, 0);
  const results = runReconciliation();
  assert.equal(getStore().invoices.length, 1);
  assert.equal(results[0].status, "reconciled");
  assert.equal(getStore().invoices[0].vendorId, "b");
});

test("vendor summary splits settled vs still-pending amounts", () => {
  const st = getStore();
  st.entities = [
    traveler("a", "A", "US", "zelle"),
    traveler("b", "B", "US", "zelle"),
  ];
  st.netObligations = [
    {
      id: "net-1",
      from: "a",
      to: "b",
      amount: 30,
      settlementCurrency: "USD",
      amountUsd: 30,
      status: "settled",
    },
    {
      id: "net-2",
      from: "a",
      to: "b",
      amount: 20,
      settlementCurrency: "USD",
      amountUsd: 20,
      status: "routed",
    },
  ];
  st.invoices = [
    {
      id: "inv-1",
      vendorId: "b",
      vendorName: "B",
      amount: 50,
      currency: "USD",
      bookingRef: "SUM",
      status: "open",
    },
  ];
  runReconciliation();
  const row = getStore().vendorSummary.find((v) => v.vendorId === "b");
  assert.ok(row);
  assert.equal(row!.settledUsd, 30);
  assert.equal(row!.pendingUsd, 20);
  assert.equal(row!.invoiceAmountUsd, 50);
});
