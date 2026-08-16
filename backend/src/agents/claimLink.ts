import { randomBytes } from "node:crypto";
import type { ClaimLink, NetObligation } from "../types";
import { payoutOptionsFor } from "../data/countries";
import {
  addClaimLink,
  addLedgerEntry,
  getClaimLink,
  getEntity,
  getNetObligation,
  getStore,
  updateClaimLink,
  updateNetObligation,
} from "../store";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export { payoutOptionsFor };
export const PAYOUT_OPTIONS = payoutOptionsFor("");

function generateClaimToken(): string {
  return `cl_${randomBytes(18).toString("base64url")}`;
}

export function createClaimLink(obligationId: string): ClaimLink | null {
  const ob = getNetObligation(obligationId);
  if (!ob || ob.chosenRail !== "claim_link") return null;

  const recipient = getEntity(ob.to);
  if (!recipient) return null;

  const now = new Date();
  const existing = getStore().claimLinks.find(
    (c) =>
      c.obligationId === obligationId &&
      c.status === "pending" &&
      new Date(c.expiresAt) >= now,
  );
  if (existing) {
    if (ob.claimToken !== existing.token) {
      updateNetObligation(obligationId, { claimToken: existing.token });
    }
    return existing;
  }

  const token = generateClaimToken();

  const link: ClaimLink = {
    token,
    obligationId,
    recipientId: recipient.id,
    recipientContact: recipient.contact.value,
    status: "pending",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SEVEN_DAYS_MS).toISOString(),
  };

  addClaimLink(link);
  updateNetObligation(obligationId, { claimToken: token });
  return link;
}

export function claimWithPayoutMethod(
  token: string,
  payoutMethod: string,
): { success: boolean; link?: ClaimLink; message: string } {
  const link = getClaimLink(token);
  if (!link) return { success: false, message: "Claim link not found." };
  if (link.status === "claimed")
    return {
      success: false,
      message: "This claim link has already been used.",
    };
  if (link.status === "expired")
    return { success: false, message: "This claim link has expired." };

  // Check expiry
  if (new Date(link.expiresAt) < new Date()) {
    updateClaimLink(token, { status: "expired" });
    return { success: false, message: "This claim link has expired." };
  }

  const recipient = getEntity(link.recipientId);
  if (!recipient || !getNetObligation(link.obligationId)) {
    return { success: false, message: "Claim link is no longer valid." };
  }
  if (!payoutOptionsFor(recipient.country).includes(payoutMethod)) {
    return { success: false, message: "Choose a valid payout method." };
  }

  updateClaimLink(token, { status: "claimed", payoutMethod });

  const claimedOb = getNetObligation(link.obligationId);
  if (claimedOb && claimedOb.status !== "settled") {
    updateNetObligation(link.obligationId, { status: "settled" });
    recordLedger(claimedOb, "claimed");
  }

  return {
    success: true,
    link: getClaimLink(token),
    message: `Payout method "${payoutMethod}" selected. Settlement queued (mocked).`,
  };
}

/** Simulate settling a non-claim-link obligation. */
export function settleObligation(obligationId: string): {
  success: boolean;
  message: string;
  link?: ClaimLink;
} {
  const ob = getNetObligation(obligationId);
  if (!ob) return { success: false, message: "Obligation not found." };
  if (ob.status === "settled")
    return { success: false, message: "Already settled." };
  if (ob.status !== "routed")
    return { success: false, message: "Obligation must be routed first." };

  if (ob.chosenRail === "claim_link") {
    const link = createClaimLink(obligationId);
    if (!link)
      return { success: false, message: "Failed to generate claim link." };
    return {
      success: true,
      message: `Claim link generated. Recipient will receive a link to choose a payout method.`,
      link,
    };
  }

  // MOCKED — in production this would call the appropriate rail API:
  //   - local: PayNow/PromptPay/Zelle/SEPA instant transfer API
  //   - linked: bilateral instant payment gateway
  //   - stable_bridge: Circle USDC mint-and-transfer API
  updateNetObligation(obligationId, { status: "settled" });
  recordLedger(ob, "settled");
  return {
    success: true,
    message: `Settled via ${ob.chosenRail} (mocked).`,
  };
}

/** Persist a ledger entry for an executed (simulated) settlement. */
function recordLedger(ob: NetObligation, status: "settled" | "claimed"): void {
  addLedgerEntry({
    id: `set-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    obligationId: ob.id,
    from: ob.from,
    to: ob.to,
    rail: ob.chosenRail ?? "stable_bridge",
    amount: ob.amount,
    currency: ob.settlementCurrency,
    amountUsd: ob.amountUsd,
    status,
    timestamp: new Date().toISOString(),
  });
}
