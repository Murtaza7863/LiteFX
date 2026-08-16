import { Router } from "express";
import {
  getStore,
  seedStore,
  updateClaimLink,
  addEntity,
  addExpense,
  updateEntity,
  updateExpense,
  clearStore,
  deleteExpense,
  deleteEntity,
  getClaimLink,
  findClaimOwner,
  runAsUser,
  addUser,
  toPublicUser,
  deleteSessionByTokenHash,
} from "./store";
import { FX_TABLE } from "./types";
import type { Expense } from "./types";
import { countryByCode } from "./data/countries";
import { getFxSnapshot } from "./fx";
import { runNetting } from "./agents/netting";
import { runRouting, getRailTypesExercised } from "./agents/railRouter";
import { runCompliance } from "./agents/compliance";
import { runReconciliation } from "./agents/reconciliation";
import { buildSettlementPlan } from "./agents/plan";
import {
  settleObligation,
  claimWithPayoutMethod,
  payoutOptionsFor,
} from "./agents/claimLink";
import {
  authRateOk,
  authenticateUser,
  clearSessionCookie,
  createSessionFor,
  csrfGuard,
  currentUser,
  hashPassword,
  newId,
  registerUser,
  requireAuth,
  sessionMiddleware,
  setSessionCookie,
  readCookie,
  SESSION_COOKIE,
  hashToken,
} from "./auth";

export const apiRouter = Router();

apiRouter.use(sessionMiddleware);
apiRouter.use(csrfGuard);
apiRouter.use(requireAuth);

apiRouter.post("/auth/signup", async (req, res) => {
  if (!authRateOk(req)) {
    res.status(429).json({
      success: false,
      message: "Too many attempts. Try again in a few minutes.",
    });
    return;
  }
  const { name, email, password } = req.body as {
    name?: string;
    email?: string;
    password?: string;
  };
  const result = await registerUser({
    name: name ?? "",
    email: email ?? "",
    password: password ?? "",
  });
  if ("error" in result) {
    res.status(result.status).json({ success: false, message: result.error });
    return;
  }
  const user = result.user;
  const token = createSessionFor(user);
  setSessionCookie(res, token);
  res.status(201).json({ success: true, user });
});

apiRouter.post("/auth/login", async (req, res) => {
  if (!authRateOk(req)) {
    res.status(429).json({
      success: false,
      message: "Too many attempts. Try again in a few minutes.",
    });
    return;
  }
  const { email, password } = req.body as { email?: string; password?: string };
  const result = await authenticateUser(email ?? "", password ?? "");
  if ("error" in result) {
    res.status(result.status).json({ success: false, message: result.error });
    return;
  }
  const token = createSessionFor(result.user);
  setSessionCookie(res, token);
  res.json({ success: true, user: result.user });
});

apiRouter.post("/auth/logout", (req, res) => {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) deleteSessionByTokenHash(hashToken(token));
  clearSessionCookie(res);
  res.json({ success: true });
});

apiRouter.get("/auth/me", (req, res) => {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ success: false, message: "Sign in required." });
    return;
  }
  res.json({ success: true, user });
});

apiRouter.post("/auth/demo", async (req, res) => {
  if (!authRateOk(req)) {
    res.status(429).json({
      success: false,
      message: "Too many attempts. Try again in a few minutes.",
    });
    return;
  }
  const id = newId("demo");
  const password = newId("pw");
  const user = {
    id: newId("usr"),
    email: `${id}@litefx.local`,
    name: "Demo traveler",
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  addUser(user);
  const token = createSessionFor(user);
  setSessionCookie(res, token);
  res.status(201).json({ success: true, user: toPublicUser(user) });
});

const EXPENSE_CATEGORIES = [
  "food",
  "accommodation",
  "transport",
  "activities",
  "general",
] as const;

type ExpenseBody = {
  payerId?: string;
  participantIds?: string[];
  amount?: number;
  currency?: string;
  description?: string;
  category?: string;
  split?: {
    mode?: "equal" | "percent" | "amount";
    parts?: Record<string, number>;
  };
};

function parseExpenseFields(
  body: ExpenseBody,
  existing?: Expense,
): { error: string } | Omit<Expense, "id" | "tripId"> {
  const store = getStore();
  const payerId = body.payerId ?? existing?.payerId;
  if (!payerId || !store.entities.some((e) => e.id === payerId)) {
    return { error: "A valid payer is required." };
  }
  const amount = body.amount ?? existing?.amount;
  const currency = body.currency ?? existing?.currency;
  if (!(Number(amount) > 0) || !currency || !FX_TABLE[currency]) {
    return {
      error: "A positive amount and supported currency are required.",
    };
  }
  if (Array.isArray(body.participantIds) && body.participantIds.length === 0) {
    return { error: "Select at least one participant." };
  }
  const known = new Set(store.entities.map((e) => e.id));
  let participants =
    Array.isArray(body.participantIds) && body.participantIds.length
      ? body.participantIds.filter((id) => known.has(id))
      : (existing?.participantIds ?? store.entities.map((e) => e.id));
  if (!participants.includes(payerId))
    participants = [...participants, payerId];
  participants = [...new Set(participants)];
  if (participants.length === 0) {
    return { error: "Select at least one participant." };
  }
  const split = body.split ?? existing?.split;
  if (split?.mode === "percent") {
    const assigned = Object.values(split.parts ?? {}).reduce(
      (s, v) => s + Number(v || 0),
      0,
    );
    if (assigned > 100.01) {
      return { error: "Percent shares cannot exceed 100%." };
    }
  }
  if (split?.mode === "amount") {
    const assigned = Object.values(split.parts ?? {}).reduce(
      (s, v) => s + Number(v || 0),
      0,
    );
    if (assigned > Number(amount) + 0.01) {
      return { error: "Assigned amounts cannot exceed the expense total." };
    }
  }
  const categoryRaw = (body.category ?? existing?.category ?? "general")
    .toLowerCase()
    .trim();
  const category = EXPENSE_CATEGORIES.includes(
    categoryRaw as (typeof EXPENSE_CATEGORIES)[number],
  )
    ? categoryRaw
    : "general";
  return {
    payerId,
    participantIds: participants,
    amount: Number(amount),
    currency,
    category,
    description:
      (body.description ?? existing?.description ?? "").trim() ||
      "Custom expense",
    split:
      split?.mode && split.mode !== "equal"
        ? { mode: split.mode, parts: split.parts ?? {} }
        : undefined,
  };
}

function tripCurrencies(): string[] {
  return [...new Set(getStore().expenses.map((e) => e.currency))];
}

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
    fx: getFxSnapshot(tripCurrencies()),
    plan: buildSettlementPlan(),
  });
});

// ── POST /api/entities — add a traveler ──
apiRouter.post("/entities", (req, res) => {
  const { name, country, contact, railType, alias } = req.body as {
    name?: string;
    country?: string;
    contact?: { type: string; value: string };
    railType?: string;
    alias?: string;
  };
  if (!name || !country) {
    res
      .status(400)
      .json({ success: false, message: "name and country are required." });
    return;
  }
  if (!countryByCode(country)) {
    res.status(400).json({ success: false, message: "Unsupported country." });
    return;
  }
  const entity = {
    id: `ent-u${Math.random().toString(36).slice(2, 7)}`,
    name,
    country,
    contact: (contact ?? { type: "email", value: "" }) as {
      type: "email" | "phone";
      value: string;
    },
    linkedRailAliases: railType ? [{ railType, alias: alias || "" }] : [],
  };
  addEntity(entity);
  res.json({ success: true, entity });
});

// ── PATCH /api/entities/:id — edit a traveler ──
apiRouter.patch("/entities/:id", (req, res) => {
  const existing = getStore().entities.find((e) => e.id === req.params.id);
  if (!existing) {
    res.status(404).json({ success: false, message: "Traveler not found." });
    return;
  }
  const { name, country, contact, railType, alias } = req.body as {
    name?: string;
    country?: string;
    contact?: { type: string; value: string };
    railType?: string | null;
    alias?: string;
  };
  if (country !== undefined && !countryByCode(country)) {
    res.status(400).json({ success: false, message: "Unsupported country." });
    return;
  }
  const patch: Parameters<typeof updateEntity>[1] = {};
  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) {
      res.status(400).json({ success: false, message: "name is required." });
      return;
    }
    patch.name = trimmed;
  }
  if (country !== undefined) patch.country = country;
  if (contact !== undefined) {
    patch.contact = {
      type: contact.type === "phone" ? "phone" : "email",
      value: contact.value ?? "",
    };
  }
  if (railType !== undefined) {
    patch.linkedRailAliases = railType
      ? [
          {
            railType,
            alias: alias || existing.linkedRailAliases[0]?.alias || "",
          },
        ]
      : [];
  }
  const entity = updateEntity(req.params.id, patch);
  res.json({ success: true, entity });
});

// ── POST /api/expenses — add an expense ──
apiRouter.post("/expenses", (req, res) => {
  const parsed = parseExpenseFields(req.body as ExpenseBody);
  if ("error" in parsed) {
    res.status(400).json({ success: false, message: parsed.error });
    return;
  }
  const expense: Expense = {
    id: `exp-u${Math.random().toString(36).slice(2, 7)}`,
    tripId: "trip-custom",
    ...parsed,
  };
  addExpense(expense);
  res.json({ success: true, expense });
});

// ── PATCH /api/expenses/:id — edit an expense ──
apiRouter.patch("/expenses/:id", (req, res) => {
  const existing = getStore().expenses.find((e) => e.id === req.params.id);
  if (!existing) {
    res.status(404).json({ success: false, message: "Expense not found." });
    return;
  }
  const parsed = parseExpenseFields(req.body as ExpenseBody, existing);
  if ("error" in parsed) {
    res.status(400).json({ success: false, message: parsed.error });
    return;
  }
  const expense = updateExpense(req.params.id, {
    ...existing,
    ...parsed,
  });
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

// ── POST /api/engine/run — net + route in one shot (hackathon demo path) ──
apiRouter.post("/engine/run", (_req, res) => {
  const netting = runNetting();
  const obligations = runRouting();
  res.json({
    ...netting,
    obligations,
    railTypesExercised: getRailTypesExercised(),
  });
});

// ── POST /api/compliance/run — run compliance checks ──
apiRouter.post("/compliance/run", (_req, res) => {
  const flags = runCompliance();
  res.json({ flags });
});

// ── POST /api/reconciliation/run — run reconciliation ──
apiRouter.post("/reconciliation/run", (_req, res) => {
  const results = runReconciliation();
  res.json({ results, vendorSummary: getStore().vendorSummary });
});

// ── POST /api/settlement/:id/settle — mock-settle an obligation ──
apiRouter.post("/settlement/:id/settle", (req, res) => {
  const result = settleObligation(req.params.id);
  res.json(result);
});

// ── GET /api/claim/:token — get claim link details ──
apiRouter.get("/claim/:token", (req, res) => {
  const token = req.params.token;
  const owner = findClaimOwner(token);
  const link = getClaimLink(token);
  if (!link || !owner) {
    res.status(404).json({ success: false, message: "Claim link not found." });
    return;
  }
  runAsUser(owner, () => {
    if (link.status === "pending" && new Date(link.expiresAt) < new Date()) {
      updateClaimLink(link.token, { status: "expired" });
      link.status = "expired";
    }
    const store = getStore();
    const recipient = store.entities.find((e) => e.id === link.recipientId);
    const obligation = store.netObligations.find(
      (o) => o.id === link.obligationId,
    );
    if (!recipient || !obligation) {
      res
        .status(404)
        .json({ success: false, message: "Claim link is no longer valid." });
      return;
    }
    res.json({
      link,
      recipient,
      obligation,
      payoutOptions: payoutOptionsFor(recipient.country),
    });
  });
});

// ── POST /api/claim/:token/claim — claim with a payout method ──
apiRouter.post("/claim/:token/claim", (req, res) => {
  const { payoutMethod } = req.body as { payoutMethod?: string };
  if (!payoutMethod) {
    res
      .status(400)
      .json({ success: false, message: "payoutMethod is required." });
    return;
  }
  const owner = findClaimOwner(req.params.token);
  const result = owner
    ? runAsUser(owner, () =>
        claimWithPayoutMethod(req.params.token, payoutMethod),
      )
    : claimWithPayoutMethod(req.params.token, payoutMethod);
  res.json(result);
});

// ── POST /api/clear — start from a blank slate ──
apiRouter.post("/clear", (_req, res) => {
  clearStore();
  res.json({
    success: true,
    message: "Cleared. Add your own travelers and expenses.",
  });
});

// ── POST /api/seed — load the sample trip ──
apiRouter.post("/seed", (_req, res) => {
  seedStore();
  res.json({ success: true, message: "Sample trip loaded." });
});
