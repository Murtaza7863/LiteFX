import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { apiRouter } from "./routes.js";
import { pagesRouter } from "./pages.js";
import { getClaimLink, resetApp, runAsUser, seedStore } from "./store.js";
import { loadTrip, traveler } from "./testUtil.js";
import { resetAuthLimits } from "./auth.js";

let server: Server;
let base = "";
let sessionCookie = "";
let userId = "";

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter);
  app.use(pagesRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  base = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

afterEach(() => {
  resetApp();
  resetAuthLimits();
  sessionCookie = "";
  userId = "";
});

beforeEach(async () => {
  resetApp();
  resetAuthLimits();
  sessionCookie = "";
  userId = "";
  const { status, body } = await json(
    "/auth/signup",
    {
      method: "POST",
      body: JSON.stringify({
        name: "Ada",
        email: "ada@x.test",
        password: "correcthorse1",
      }),
    },
    false,
  );
  assert.equal(status, 201, body.message);
  userId = body.user.id as string;
});

function asUser<T>(fn: () => T): T {
  return runAsUser(userId, fn);
}

async function json(path: string, init?: RequestInit, authed = true) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(authed && sessionCookie ? { cookie: sessionCookie } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const raw = setCookie[0] ?? res.headers.get("set-cookie") ?? "";
  if (raw) sessionCookie = raw.split(";")[0];
  const text = await res.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

test("POST /entities requires name and country", async () => {
  const { status, body } = await json("/entities", {
    method: "POST",
    body: JSON.stringify({ name: "Sam" }),
  });
  assert.equal(status, 400);
  assert.equal(body.success, false);
});

test("POST /entities rejects an unsupported country", async () => {
  const { status, body } = await json("/entities", {
    method: "POST",
    body: JSON.stringify({ name: "Sam", country: "XX" }),
  });
  assert.equal(status, 400);
  assert.match(body.message, /country/i);
});

test("POST /expenses rejects an empty participant list", async () => {
  asUser(() => loadTrip([traveler("a", "A", "US", "zelle")]));
  const { status, body } = await json("/expenses", {
    method: "POST",
    body: JSON.stringify({
      payerId: "a",
      participantIds: [],
      amount: 20,
      currency: "USD",
      description: "Nope",
    }),
  });
  assert.equal(status, 400);
  assert.match(body.message, /participant/i);
});

test("POST /expenses rejects an unknown payer", async () => {
  const { status, body } = await json("/expenses", {
    method: "POST",
    body: JSON.stringify({
      payerId: "ghost",
      amount: 20,
      currency: "USD",
    }),
  });
  assert.equal(status, 400);
  assert.match(body.message, /payer/i);
});

test("POST /expenses rejects an unsupported currency", async () => {
  asUser(() => loadTrip([traveler("a", "A", "US", "zelle")]));
  const { status, body } = await json("/expenses", {
    method: "POST",
    body: JSON.stringify({
      payerId: "a",
      amount: 20,
      currency: "XYZ",
    }),
  });
  assert.equal(status, 400);
  assert.match(body.message, /currency/i);
});

test("POST /engine/run nets and routes the sample trip", async () => {
  asUser(() => seedStore());
  const { status, body } = await json("/engine/run", { method: "POST" });
  assert.equal(status, 200);
  assert.ok(body.netEdgeCount > 0);
  assert.ok(body.netEdgeCount < body.rawEdgeCount);
  assert.ok(body.railTypesExercised.includes("claim_link"));
  assert.ok(
    body.obligations.every((o: { status: string }) => o.status === "routed"),
  );
});

test("GET /claim/:token 404s for an unknown token", async () => {
  const { status, body } = await json("/claim/cl_missing");
  assert.equal(status, 404);
  assert.equal(body.success, false);
});

test("POST /claim/:token/claim requires a payout method", async () => {
  const { status, body } = await json("/claim/cl_x/claim", {
    method: "POST",
    body: JSON.stringify({}),
  });
  assert.equal(status, 400);
  assert.match(body.message, /payoutMethod/i);
});

test("GET /claim/:token marks a past-due pending link expired", async () => {
  asUser(() => seedStore());
  await json("/engine/run", { method: "POST" });
  const scenario = await json("/scenario");
  const claimOb = scenario.body.netObligations.find(
    (o: { chosenRail?: string }) => o.chosenRail === "claim_link",
  );
  assert.ok(claimOb);
  const settled = await json(`/settlement/${claimOb.id}/settle`, {
    method: "POST",
  });
  const token = settled.body.link.token as string;
  const link = getClaimLink(token)!;
  link.expiresAt = new Date(Date.now() - 1000).toISOString();

  const { status, body } = await json(`/claim/${token}`);
  assert.equal(status, 200);
  assert.equal(body.link.status, "expired");
});

test("POST /entities then GET /scenario includes the traveler", async () => {
  const created = await json("/entities", {
    method: "POST",
    body: JSON.stringify({ name: "Sam", country: "SG", railType: "paynow" }),
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.success, true);
  const scenario = await json("/scenario");
  assert.equal(scenario.body.entities.length, 1);
  assert.equal(scenario.body.entities[0].name, "Sam");
});

test("DELETE /expenses/:id removes the expense", async () => {
  asUser(() =>
    loadTrip(
      [traveler("a", "A", "US", "zelle"), traveler("b", "B", "US", "zelle")],
      [
        {
          id: "e1",
          payerId: "a",
          participantIds: ["a", "b"],
          amount: 40,
          currency: "USD",
          tripId: "t",
          category: "general",
          description: "Lunch",
        },
      ],
    ),
  );
  const { body } = await json("/expenses/e1", { method: "DELETE" });
  assert.equal(body.success, true);
  const scenario = await json("/scenario");
  assert.equal(scenario.body.expenses.length, 0);
});

test("POST /engine/run on an empty store returns zero nets", async () => {
  const { status, body } = await json("/engine/run", { method: "POST" });
  assert.equal(status, 200);
  assert.equal(body.netEdgeCount, 0);
  assert.deepEqual(body.obligations, []);
});

test("shareable claim page 404s for a missing token", async () => {
  const res = await fetch(base.replace(/\/api$/, "") + "/claim/cl_missing");
  assert.equal(res.status, 404);
  const html = await res.text();
  assert.match(html, /not found/i);
});

test("GET /scenario includes FX rates and a settlement plan", async () => {
  const { status, body } = await json("/scenario");
  assert.equal(status, 200);
  assert.equal(body.fx.rates.USD, 1);
  assert.equal(typeof body.fx.live, "boolean");
  assert.match(body.plan.text, /settlement plan/i);
});

test("PATCH /entities/:id updates the traveler", async () => {
  const created = await json("/entities", {
    method: "POST",
    body: JSON.stringify({ name: "Sam", country: "SG", railType: "PayNow" }),
  });
  const id = created.body.entity.id as string;
  const { status, body } = await json(`/entities/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name: "Samantha", railType: null }),
  });
  assert.equal(status, 200);
  assert.equal(body.entity.name, "Samantha");
  assert.deepEqual(body.entity.linkedRailAliases, []);
});

test("PATCH /entities/:id 404s for an unknown traveler", async () => {
  const { status, body } = await json("/entities/ent-missing", {
    method: "PATCH",
    body: JSON.stringify({ name: "Nope" }),
  });
  assert.equal(status, 404);
  assert.equal(body.success, false);
});

test("PATCH /expenses/:id updates amount and category", async () => {
  asUser(() =>
    loadTrip(
      [traveler("a", "A", "US", "zelle"), traveler("b", "B", "US", "zelle")],
      [
        {
          id: "e1",
          payerId: "a",
          participantIds: ["a", "b"],
          amount: 40,
          currency: "USD",
          tripId: "t",
          category: "general",
          description: "Lunch",
        },
      ],
    ),
  );
  const { status, body } = await json("/expenses/e1", {
    method: "PATCH",
    body: JSON.stringify({ amount: 55, category: "food" }),
  });
  assert.equal(status, 200);
  assert.equal(body.expense.amount, 55);
  assert.equal(body.expense.category, "food");
  const scenario = await json("/scenario");
  assert.equal(scenario.body.debtEdges[0].amount, 27.5);
});

test("sample trip plan after engine run includes Eve's link-account tip", async () => {
  asUser(() => seedStore());
  await json("/engine/run", { method: "POST" });
  const { body } = await json("/scenario");
  assert.ok(
    body.plan.insights.some(
      (i: { recipientName: string }) => i.recipientName === "Eve Lim",
    ),
  );
});

test("GET /scenario requires sign-in", async () => {
  const { status, body } = await json("/scenario", undefined, false);
  assert.equal(status, 401);
  assert.equal(body.success, false);
});
