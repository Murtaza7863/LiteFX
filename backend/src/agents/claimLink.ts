import type { ClaimLink, NetObligation } from "../types";
import { addClaimLink, getClaimLink, getEntity, getNetObligation, updateClaimLink, updateNetObligation } from "../store";

// ──────────────────────────────────────────────
// Agent 3 — Claim-link agent
//
// When routing outputs `claim_link`:
//   1. Generate a unique token bound to the obligation id
//      and the recipient's contact.
//   2. Status: pending → claimed → expired (mock 7-day expiry).
//   3. Recipient opens the link, picks a payout method from
//      a mocked list, status flips to "claimed".
//      No account creation step.
//
// MOCKED — in production this would:
//   - Send an SMS/email with the claim link (e.g. via Twilio/SendGrid)
//   - Store the claim in a database with signed tokens
//   - Integrate with a payout provider (Wise, Stripe, or local rails)
//   - Enforce real KYC before payout
// ──────────────────────────────────────────────

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Mocked payout options the recipient can choose.
export const PAYOUT_OPTIONS = [
  "Local bank transfer (provide IBAN / account no.)",
  "E-wallet (GrabPay, TrueMoney, Alipay, etc.)",
  "Cash pickup at Western Union / MoneyGram agent",
  "Donate to charity",
];

export function generateClaimToken(): string {
  // Simple unique token — in production use a signed JWT or UUIDv4.
  return `cl_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function createClaimLink(obligationId: string): ClaimLink | null {
  const ob = getNetObligation(obligationId);
  if (!ob || ob.chosenRail !== "claim_link") return null;

  const recipient = getEntity(ob.to);
  if (!recipient) return null;

  const now = new Date();
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

export function claimLinkByToken(token: string): ClaimLink | undefined {
  return getClaimLink(token);
}

export function claimWithPayoutMethod(
  token: string,
  payoutMethod: string
): { success: boolean; link?: ClaimLink; message: string } {
  const link = getClaimLink(token);
  if (!link) return { success: false, message: "Claim link not found." };
  if (link.status === "claimed")
    return { success: false, message: "This claim link has already been used." };
  if (link.status === "expired")
    return { success: false, message: "This claim link has expired." };

  // Check expiry
  if (new Date(link.expiresAt) < new Date()) {
    updateClaimLink(token, { status: "expired" });
    return { success: false, message: "This claim link has expired." };
  }

  updateClaimLink(token, { status: "claimed", payoutMethod });

  // Mark the underlying obligation as settled (MOCKED — in production
  // the payout would only be marked settled after the rail confirms).
  updateNetObligation(link.obligationId, { status: "settled" });

  return {
    success: true,
    link: getClaimLink(token),
    message: `Payout method "${payoutMethod}" selected. Settlement queued (mocked).`,
  };
}

/** Simulate settling a non-claim-link obligation. */
export function settleObligation(
  obligationId: string
): { success: boolean; message: string } {
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
    };
  }

  // MOCKED — in production this would call the appropriate rail API:
  //   - local: PayNow/PromptPay/Zelle/SEPA instant transfer API
  //   - linked: bilateral instant payment gateway
  //   - stable_bridge: Circle USDC mint-and-transfer API
  updateNetObligation(obligationId, { status: "settled" });
  return {
    success: true,
    message: `Settled via ${ob.chosenRail} (mocked).`,
  };
}
