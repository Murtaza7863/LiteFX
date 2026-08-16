import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { clearStore, getStore, seedStore, updateClaimLink } from "../store.js";
import {
  claimWithPayoutMethod,
  createClaimLink,
  settleObligation,
} from "./claimLink.js";
import { runNetting } from "./netting.js";
import { runRouting } from "./railRouter.js";

afterEach(() => {
  clearStore();
});

function seedRouted() {
  seedStore();
  runNetting();
  runRouting();
}

function claimObligation() {
  const ob = getStore().netObligations.find(
    (o) => o.chosenRail === "claim_link",
  );
  assert.ok(ob, "sample trip should produce a claim_link obligation");
  return ob!;
}

function localObligation() {
  const ob = getStore().netObligations.find(
    (o) => o.chosenRail === "local" || o.chosenRail === "linked",
  );
  assert.ok(ob, "sample trip should produce a non-claim obligation");
  return ob!;
}

test("Clear all drops seed invoices so recon cannot use stale vendors", () => {
  seedStore();
  assert.ok(getStore().invoices.length > 0);
  clearStore();
  assert.equal(getStore().invoices.length, 0);
  assert.equal(getStore().entities.length, 0);
  assert.equal(getStore().ledger.length, 0);
});

test("settling a claim_link twice reuses the same token", () => {
  seedRouted();
  const ob = claimObligation();
  const first = settleObligation(ob.id);
  const second = settleObligation(ob.id);
  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.ok(first.link?.token);
  assert.equal(first.link?.token, second.link?.token);
  const links = getStore().claimLinks.filter((c) => c.obligationId === ob.id);
  assert.equal(links.length, 1);
  const reused = createClaimLink(ob.id);
  assert.equal(reused?.token, first.link?.token);
});

test("createClaimLink is a no-op for non-claim rails", () => {
  seedRouted();
  const ob = localObligation();
  assert.equal(createClaimLink(ob.id), null);
});

test("settle before routing is rejected", () => {
  seedStore();
  runNetting();
  const ob = getStore().netObligations[0];
  assert.ok(ob);
  const res = settleObligation(ob.id);
  assert.equal(res.success, false);
  assert.match(res.message, /routed first/i);
});

test("settle of a missing obligation fails", () => {
  const res = settleObligation("net-missing");
  assert.equal(res.success, false);
});

test("settling a local rail writes one ledger row and cannot settle twice", () => {
  seedRouted();
  const ob = localObligation();
  const first = settleObligation(ob.id);
  assert.equal(first.success, true);
  assert.equal(getStore().ledger.length, 1);
  assert.equal(getNetStatus(ob.id), "settled");
  const second = settleObligation(ob.id);
  assert.equal(second.success, false);
  assert.match(second.message, /already settled/i);
  assert.equal(getStore().ledger.length, 1);
});

test("claiming a payout settles once and a second claim is rejected", () => {
  seedRouted();
  const ob = claimObligation();
  const settled = settleObligation(ob.id);
  const token = settled.link!.token;
  const first = claimWithPayoutMethod(
    token,
    "E-wallet (GrabPay, TrueMoney, Alipay, etc.)",
  );
  assert.equal(first.success, true);
  assert.equal(first.link?.status, "claimed");
  assert.equal(getNetStatus(ob.id), "settled");
  assert.equal(getStore().ledger.length, 1);
  assert.equal(getStore().ledger[0].status, "claimed");

  const second = claimWithPayoutMethod(token, "Donate to charity");
  assert.equal(second.success, false);
  assert.match(second.message, /already been used/i);
  assert.equal(getStore().ledger.length, 1);
});

test("unknown claim token is rejected", () => {
  const res = claimWithPayoutMethod("cl_nope", "Donate to charity");
  assert.equal(res.success, false);
  assert.match(res.message, /not found/i);
});

test("expired claim links cannot be paid out", () => {
  seedRouted();
  const ob = claimObligation();
  const token = settleObligation(ob.id).link!.token;
  updateClaimLink(token, {
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  });
  const res = claimWithPayoutMethod(token, "Donate to charity");
  assert.equal(res.success, false);
  assert.match(res.message, /expired/i);
  assert.equal(getStore().claimLinks[0].status, "expired");
  assert.equal(getStore().ledger.length, 0);
});

function getNetStatus(id: string) {
  return getStore().netObligations.find((o) => o.id === id)?.status;
}
