import { Router } from "express";
import { getStore, resetStore, seedStore, updateClaimLink, addEntity, addExpense, clearStore, deleteExpense, deleteEntity } from "./store";
import { FX_TABLE } from "./types";
import { COUNTRIES } from "./data/countries";
import { runNetting } from "./agents/netting";
import { runRouting, getRailTypesExercised } from "./agents/railRouter";
import { runCompliance } from "./agents/compliance";
import { runReconciliation, getVendorSummary } from "./agents/reconciliation";
import {
  settleObligation,
  createClaimLink,
  claimWithPayoutMethod,
  claimLinkByToken,
  PAYOUT_OPTIONS,
} from "./agents/claimLink";

export const apiRouter = Router();

// ── GET /api/scenario — seeded scenario (entities, expenses, raw debts, invoices) ──
apiRouter.get("/scenario", (_req, res) => {
  const store = getStore();
  res.json({
    entities: store.entities,
    expenses: store.expenses,
    debtEdges: store.debtEdges,
    invoices: store.invoices,
    netObligations: store.netObligations,
    claimLinks: store.claimLinks,
    complianceFlags: store.complianceFlags,
    reconciliationResults: store.reconciliationResults,
    ledger: store.ledger,
    nettingSummary: store.nettingSummary,
    complianceRan: store.complianceRan,
    reconciliationRan: store.reconciliationRan,
    vendorSummary: store.vendorSummary,
  });
});

// ── GET /api/ledger — persisted settlement ledger ──
apiRouter.get("/ledger", (_req, res) => {
  res.json({ ledger: getStore().ledger });
});

// ── POST /api/entities — add a traveler ──
apiRouter.post("/entities", (req, res) => {
  const { name, country, contact, railType, alias } = req.body as {
    name?: string; country?: string; contact?: { type: string; value: string };
    railType?: string; alias?: string;
  };
  if (!name || !country) {
    res.status(400).json({ success: false, message: "name and country are required." });
    return;
  }
  const entity = {
    id: `ent-u${Math.random().toString(36).slice(2, 7)}`,
    name,
    country,
    contact: (contact ?? { type: "email", value: "" }) as { type: "email" | "phone"; value: string },
    linkedRailAliases: railType ? [{ railType, alias: alias || "" }] : [],
  };
  addEntity(entity);
  res.json({ success: true, entity });
});

// ── POST /api/expenses — add an expense ──
apiRouter.post("/expenses", (req, res) => {
  const { payerId, participantIds, amount, currency, description, split } = req.body as {
    payerId?: string; participantIds?: string[]; amount?: number; currency?: string; description?: string;
    split?: { mode?: "equal" | "percent" | "amount"; parts?: Record<string, number> };
  };
  const store = getStore();
  if (!payerId || !store.entities.some((e) => e.id === payerId)) {
    res.status(400).json({ success: false, message: "A valid payer is required." });
    return;
  }
  if (!(amount! > 0) || !currency || !FX_TABLE[currency]) {
    res.status(400).json({ success: false, message: "A positive amount and supported currency are required." });
    return;
  }
  let participants = Array.isArray(participantIds) && participantIds.length ? participantIds : store.entities.map((e) => e.id);
  if (!participants.includes(payerId)) participants = [...participants, payerId];
  const expense = {
    id: `exp-u${Math.random().toString(36).slice(2, 7)}`,
    payerId,
    participantIds: participants,
    amount: Number(amount),
    currency,
    tripId: "trip-custom",
    category: "general",
    description: description || "Custom expense",
    split: split?.mode && split.mode !== "equal" ? { mode: split.mode, parts: split.parts ?? {} } : undefined,
  };
  addExpense(expense);
  res.json({ success: true, expense });
});

// ── DELETE /api/expenses/:id — remove an expense ──
apiRouter.delete("/expenses/:id", (req, res) => {
  const ok = deleteExpense(req.params.id);
  res.json({ success: ok });
});

// ── DELETE /api/entities/:id — remove a traveler (and their expenses) ──
apiRouter.delete("/entities/:id", (req, res) => {
  const ok = deleteEntity(req.params.id);
  res.json({ success: ok });
});

// ── POST /api/netting/run — run the netting agent ──
apiRouter.post("/netting/run", (_req, res) => {
  const result = runNetting();
  res.json(result);
});

// ── POST /api/routing/run — run the rail router on all pending obligations ──
apiRouter.post("/routing/run", (_req, res) => {
  const obligations = runRouting();
  const railTypes = getRailTypesExercised();
  res.json({ obligations, railTypesExercised: railTypes });
});

// ── POST /api/compliance/run — run compliance checks ──
apiRouter.post("/compliance/run", (_req, res) => {
  const flags = runCompliance();
  res.json({ flags });
});

// ── POST /api/reconciliation/run — run reconciliation ──
apiRouter.post("/reconciliation/run", (_req, res) => {
  const results = runReconciliation();
  const vendorSummary = getVendorSummary();
  res.json({ results, vendorSummary });
});

// ── POST /api/settlement/:id/settle — mock-settle an obligation ──
apiRouter.post("/settlement/:id/settle", (req, res) => {
  const result = settleObligation(req.params.id);
  res.json(result);
});

// ── POST /api/claim/:token/create — (re)generate a claim link ──
apiRouter.post("/claim/:token/create", (req, res) => {
  // token here is actually the obligationId — we use the URL param loosely
  const link = createClaimLink(req.params.token);
  if (!link) {
    res.status(400).json({ success: false, message: "Obligation not found or not a claim_link rail." });
    return;
  }
  res.json({ success: true, link });
});

// ── GET /api/claim/:token — get claim link details ──
apiRouter.get("/claim/:token", (req, res) => {
  const link = claimLinkByToken(req.params.token);
  if (!link) {
    res.status(404).json({ success: false, message: "Claim link not found." });
    return;
  }
  // Reflect expiry on read: a pending link past its expiry becomes expired.
  if (link.status === "pending" && new Date(link.expiresAt) < new Date()) {
    updateClaimLink(link.token, { status: "expired" });
    link.status = "expired";
  }
  const store = getStore();
  const recipient = store.entities.find((e) => e.id === link.recipientId);
  const obligation = store.netObligations.find((o) => o.id === link.obligationId);
  res.json({
    link,
    recipient,
    obligation,
    payoutOptions: PAYOUT_OPTIONS,
  });
});

// ── POST /api/claim/:token/claim — claim with a payout method ──
apiRouter.post("/claim/:token/claim", (req, res) => {
  const { payoutMethod } = req.body as { payoutMethod?: string };
  if (!payoutMethod) {
    res.status(400).json({ success: false, message: "payoutMethod is required." });
    return;
  }
  const result = claimWithPayoutMethod(req.params.token, payoutMethod);
  res.json(result);
});

// ── POST /api/reset — reset the store to seed state ──
apiRouter.post("/reset", (_req, res) => {
  resetStore();
  res.json({ success: true, message: "Store reset to seed state." });
});

// ── POST /api/clear — start from a blank slate ──
apiRouter.post("/clear", (_req, res) => {
  clearStore();
  res.json({ success: true, message: "Cleared. Add your own travelers and expenses." });
});

// ── GET /api/meta — supported countries/currencies (broad base) ──
apiRouter.get("/meta", (_req, res) => {
  res.json({ countries: COUNTRIES });
});

// ── POST /api/seed — load the sample trip ──
apiRouter.post("/seed", (_req, res) => {
  seedStore();
  res.json({ success: true, message: "Sample trip loaded." });
});
