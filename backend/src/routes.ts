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
  withClaimTrip,
  validateExpenseSplit,
  addUser,
  toPublicUser,
  deleteSessionByTokenHash,
  persistenceStatus,
  loadSampleTrip,
  listTripSummaries,
  currentTripSummary,
  createTrip,
  selectTrip,
  renameTrip,
  deleteTrip,
} from "./store";
import { FX_TABLE } from "./types";
import type { Expense } from "./types";
import { canonicalizeRail, countryByCode } from "./data/countries";
import { classifyExpense, isExpenseCategory } from "./data/classifyExpense";
import { getFxSnapshot } from "./fx";
import { runNetting } from "./agents/netting";
import {
  linkRecipientAccount,
  overrideRail,
  rerouteUnsettled,
  runRouting,
  getRailTypesExercised,
} from "./agents/railRouter";
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
  validateName,
  claimRateOk,
} from "./auth";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  const persistence = persistenceStatus();
  res.status(persistence.healthy ? 200 : 503).json({
    ok: persistence.healthy,
    service: "litefx",
    persistence: persistence.mode,
  });
});

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
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_DEMO_AUTH !== "true"
  ) {
    res.status(404).json({ success: false, message: "Demo mode is disabled." });
    return;
  }
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

type ContactInput = { type: string; value: string };

function parseContact(
  contact: ContactInput | undefined,
): { type: "email" | "phone"; value: string } | { error: string } {
  if (!contact) return { type: "email", value: "" };
  if (contact.type !== "email" && contact.type !== "phone") {
    return { error: "Contact type must be email or phone." };
  }
  const value = (contact.value ?? "").trim();
  if (value.length > 254) return { error: "Contact is too long." };
  if (!value) return { type: contact.type, value: "" };
  if (contact.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { error: "Enter a valid contact email." };
  }
  if (contact.type === "phone") {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) {
      return { error: "Enter a valid contact phone number." };
    }
  }
  return { type: contact.type, value };
}

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
  const amt = Number(amount);
  if (
    !Number.isFinite(amt) ||
    amt <= 0 ||
    amt > 1_000_000_000_000 ||
    !currency ||
    !FX_TABLE[currency]
  ) {
    return {
      error: "A positive amount and supported currency are required.",
    };
  }
  if (Array.isArray(body.participantIds) && body.participantIds.length === 0) {
    return { error: "Select at least one participant." };
  }
  const known = new Set(store.entities.map((e) => e.id));
  if (
    Array.isArray(body.participantIds) &&
    body.participantIds.some((id) => !known.has(id))
  ) {
    return { error: "Every participant must be a traveler on this trip." };
  }
  let participants =
    Array.isArray(body.participantIds) && body.participantIds.length
      ? body.participantIds.filter((id) => known.has(id))
      : (existing?.participantIds ?? store.entities.map((e) => e.id));
  participants = [...new Set(participants)];
  if (participants.length === 0) {
    return { error: "Select at least one participant." };
  }
  const split = body.split ?? existing?.split;
  const splitError = validateExpenseSplit(split, amt);
  if (splitError) return { error: splitError };
  const description = (
    (body.description ?? existing?.description ?? "").trim() || "Custom expense"
  ).slice(0, 200);
  const rawCategory = (body.category ?? "").toLowerCase().trim();
  const category = isExpenseCategory(rawCategory)
    ? rawCategory
    : existing && body.category === undefined && existing.category
      ? existing.category
      : classifyExpense(description).category;
  return {
    payerId,
    participantIds: participants,
    amount: amt,
    currency,
    category,
    description,
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
    trip: currentTripSummary(),
    trips: listTripSummaries(),
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
  const {
    name: nameRaw,
    country,
    contact,
    railType,
    alias,
  } = req.body as {
    name?: string;
    country?: string;
    contact?: { type: string; value: string };
    railType?: string;
    alias?: string;
  };
  const name = (nameRaw ?? "").trim();
  if (!name || !country) {
    res
      .status(400)
      .json({ success: false, message: "name and country are required." });
    return;
  }
  const nameError = validateName(name);
  if (nameError) {
    res.status(400).json({ success: false, message: nameError });
    return;
  }
  if (!countryByCode(country)) {
    res.status(400).json({ success: false, message: "Unsupported country." });
    return;
  }
  const rail = canonicalizeRail(country, railType);
  if (railType?.trim() && !rail) {
    res
      .status(400)
      .json({ success: false, message: "Unsupported settlement rail." });
    return;
  }
  const parsedContact = parseContact(contact);
  if ("error" in parsedContact) {
    res.status(400).json({ success: false, message: parsedContact.error });
    return;
  }
  const entity = {
    id: `ent-u${Math.random().toString(36).slice(2, 7)}`,
    name,
    country,
    contact: parsedContact,
    linkedRailAliases: rail ? [{ railType: rail, alias: alias || "" }] : [],
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
    const nameError = validateName(trimmed);
    if (nameError) {
      res.status(400).json({ success: false, message: nameError });
      return;
    }
    patch.name = trimmed;
  }
  if (country !== undefined) patch.country = country;
  if (contact !== undefined) {
    const parsedContact = parseContact(contact);
    if ("error" in parsedContact) {
      res.status(400).json({ success: false, message: parsedContact.error });
      return;
    }
    patch.contact = parsedContact;
  }
  if (railType !== undefined) {
    const rail = canonicalizeRail(country ?? existing.country, railType);
    if (railType?.trim() && !rail) {
      res
        .status(400)
        .json({ success: false, message: "Unsupported settlement rail." });
      return;
    }
    patch.linkedRailAliases = rail
      ? [
          {
            railType: rail,
            alias: alias || existing.linkedRailAliases[0]?.alias || "",
          },
        ]
      : [];
  } else if (country !== undefined && existing.linkedRailAliases[0]) {
    const rail = canonicalizeRail(
      country,
      existing.linkedRailAliases[0].railType,
    );
    patch.linkedRailAliases = rail
      ? [
          {
            railType: rail,
            alias: existing.linkedRailAliases[0].alias,
          },
        ]
      : [];
  }
  const entity = updateEntity(req.params.id, patch);
  if (
    patch.linkedRailAliases &&
    getStore().netObligations.some((o) => o.status !== "settled")
  ) {
    rerouteUnsettled({ to: req.params.id });
  }
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
    tripId: getStore().id,
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
  if (!ok) {
    res.status(404).json({ success: false, message: "Expense not found." });
    return;
  }
  res.json({ success: true });
});

// ── DELETE /api/entities/:id — remove a traveler (bills they paid, their share of others) ──
apiRouter.delete("/entities/:id", (req, res) => {
  const ok = deleteEntity(req.params.id);
  if (!ok) {
    res.status(404).json({ success: false, message: "Traveler not found." });
    return;
  }
  res.json({ success: true });
});

// ── POST /api/netting/run — run the netting agent ──
apiRouter.post("/netting/run", (_req, res) => {
  if (getStore().debtEdges.length === 0) {
    res.status(400).json({
      success: false,
      message: "Add a shared expense before running netting.",
    });
    return;
  }
  if (getStore().netObligations.length > 0) {
    res.status(409).json({
      success: false,
      message: "This trip is already netted.",
    });
    return;
  }
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
  if (getStore().debtEdges.length === 0) {
    res.status(400).json({
      success: false,
      message: "Add a shared expense before running the engine.",
    });
    return;
  }
  if (getStore().netObligations.length > 0) {
    res.status(409).json({
      success: false,
      message: "This trip is already netted.",
    });
    return;
  }
  const netting = runNetting();
  const obligations = runRouting();
  res.json({
    ...netting,
    obligations,
    railTypesExercised: getRailTypesExercised(),
  });
});

// ── POST /api/obligations/:id/rail — judge/demo rail override ──
apiRouter.post("/obligations/:id/rail", (req, res) => {
  const railName = String(
    (req.body as { railName?: string })?.railName ?? "",
  ).trim();
  if (!railName) {
    res.status(400).json({ success: false, message: "railName is required." });
    return;
  }
  try {
    const obligation = overrideRail(req.params.id, railName);
    res.json({ success: true, obligation });
  } catch (e) {
    const msg = (e as Error).message;
    const code = /not found/i.test(msg)
      ? 404
      : /settled|no linked|not available/i.test(msg)
        ? 400
        : 400;
    res.status(code).json({ success: false, message: msg });
  }
});

// ── POST /api/entities/:id/link-account — attach primary rail and re-route ──
apiRouter.post("/entities/:id/link-account", (req, res) => {
  try {
    const entity = linkRecipientAccount(req.params.id);
    res.json({ success: true, entity });
  } catch (e) {
    res.status(404).json({ success: false, message: (e as Error).message });
  }
});

// ── POST /api/settlement/:id/settle — mock-settle an obligation ──
apiRouter.post("/settlement/:id/settle", (req, res) => {
  const result = settleObligation(req.params.id);
  if (!result.success) {
    const status = /not found/i.test(result.message)
      ? 404
      : /already settled/i.test(result.message)
        ? 409
        : 400;
    res.status(status).json(result);
    return;
  }
  res.json(result);
});

// ── GET /api/claim/:token — get claim link details ──
apiRouter.get("/claim/:token", (req, res) => {
  const token = req.params.token;
  const result = withClaimTrip(token, () => {
    const link = getClaimLink(token);
    if (!link) return null;
    if (link.status === "pending" && new Date(link.expiresAt) < new Date()) {
      updateClaimLink(link.token, { status: "expired" });
      link.status = "expired";
    }
    const store = getStore();
    const recipient = store.entities.find((e) => e.id === link.recipientId);
    const obligation = store.netObligations.find(
      (o) => o.id === link.obligationId,
    );
    if (!recipient || !obligation) return null;
    return {
      link,
      recipient,
      obligation,
      payoutOptions: payoutOptionsFor(recipient.country),
    };
  });
  if (!result) {
    res.status(404).json({
      success: false,
      message: findClaimOwner(token)
        ? "Claim link is no longer valid."
        : "Claim link not found.",
    });
    return;
  }
  res.json(result);
});

// ── POST /api/claim/:token/claim — claim with a payout method ──
apiRouter.post("/claim/:token/claim", (req, res) => {
  if (!claimRateOk(req, req.params.token)) {
    res.status(429).json({
      success: false,
      message: "Too many claim attempts. Try again in a few minutes.",
    });
    return;
  }
  const { payoutMethod } = req.body as { payoutMethod?: string };
  if (!payoutMethod) {
    res
      .status(400)
      .json({ success: false, message: "payoutMethod is required." });
    return;
  }
  const result = withClaimTrip(req.params.token, () =>
    claimWithPayoutMethod(req.params.token, payoutMethod),
  );
  if (!result) {
    res.status(404).json({ success: false, message: "Claim link not found." });
    return;
  }
  if (!result.success) {
    const status = /not found|no longer valid/i.test(result.message)
      ? 404
      : /already|expired/i.test(result.message)
        ? 409
        : 400;
    res.status(status).json(result);
    return;
  }
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
apiRouter.post("/seed", (req, res) => {
  const asNew = !!(req.body as { asNew?: boolean } | undefined)?.asNew;
  if (asNew) {
    const result = loadSampleTrip();
    if ("error" in result) {
      res.status(400).json({ success: false, message: result.error });
      return;
    }
  } else {
    seedStore();
  }
  res.json({
    success: true,
    message: "Sample trip loaded.",
    trip: currentTripSummary(),
    trips: listTripSummaries(),
  });
});

apiRouter.post("/trips", (req, res) => {
  const result = createTrip((req.body as { name?: string })?.name);
  if ("error" in result) {
    res.status(400).json({ success: false, message: result.error });
    return;
  }
  res.json({
    success: true,
    trip: currentTripSummary(),
    trips: listTripSummaries(),
  });
});

apiRouter.post("/trips/:id/select", (req, res) => {
  if (!selectTrip(req.params.id)) {
    res.status(404).json({ success: false, message: "Trip not found." });
    return;
  }
  res.json({
    success: true,
    trip: currentTripSummary(),
    trips: listTripSummaries(),
  });
});

apiRouter.patch("/trips/:id", (req, res) => {
  const result = renameTrip(
    req.params.id,
    (req.body as { name?: string })?.name ?? "",
  );
  if ("error" in result) {
    const status = result.error === "Trip not found." ? 404 : 400;
    res.status(status).json({ success: false, message: result.error });
    return;
  }
  res.json({
    success: true,
    trip: currentTripSummary(),
    trips: listTripSummaries(),
  });
});

apiRouter.delete("/trips/:id", (req, res) => {
  const result = deleteTrip(req.params.id);
  if ("error" in result) {
    const status = result.error === "Trip not found." ? 404 : 400;
    res.status(status).json({ success: false, message: result.error });
    return;
  }
  res.json({
    success: true,
    trip: currentTripSummary(),
    trips: listTripSummaries(),
  });
});
