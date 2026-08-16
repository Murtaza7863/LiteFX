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
      "x-litefx-request": "1",
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

test("POST /expenses rejects a non-finite amount", async () => {
  asUser(() => loadTrip([traveler("a", "A", "US", "zelle")]));
  const { status, body } = await json("/expenses", {
    method: "POST",
    body: JSON.stringify({
      payerId: "a",
      amount: "Infinity",
      currency: "USD",
      description: "Nope",
    }),
  });
  assert.equal(status, 400);
  assert.match(body.message, /amount/i);
});

test("POST /expenses rejects NaN split shares", async () => {
  asUser(() =>
    loadTrip([
      traveler("a", "A", "US", "zelle"),
      traveler("b", "B", "US", "zelle"),
    ]),
  );
  const { status, body } = await json("/expenses", {
    method: "POST",
    body: JSON.stringify({
      payerId: "a",
      amount: 20,
      currency: "USD",
      participantIds: ["a", "b"],
      split: { mode: "percent", parts: { b: "nope" } },
    }),
  });
  assert.equal(status, 400);
  assert.match(body.message, /split/i);
});

test("POST /entities rejects a whitespace-only name", async () => {
  const { status, body } = await json("/entities", {
    method: "POST",
    body: JSON.stringify({ name: "   ", country: "US" }),
  });
  assert.equal(status, 400);
  assert.match(body.message, /name/i);
});

test("POST /expenses can split among others without adding the payer", async () => {
  asUser(() =>
    loadTrip([
      traveler("a", "A", "US", "zelle"),
      traveler("b", "B", "US", "zelle"),
      traveler("c", "C", "US", "zelle"),
    ]),
  );
  const { status, body } = await json("/expenses", {
    method: "POST",
    body: JSON.stringify({
      payerId: "a",
      participantIds: ["b", "c"],
      amount: 80,
      currency: "USD",
      description: "Their dinner",
    }),
  });
  assert.equal(status, 200);
  assert.deepEqual(body.expense.participantIds.sort(), ["b", "c"]);
  const { body: scenario } = await json("/scenario");
  assert.deepEqual(
    scenario.debtEdges
      .map(
        (e: { from: string; to: string; amountUsd: number }) =>
          `${e.from}->${e.to}:${e.amountUsd}`,
      )
      .sort(),
    ["b->a:40", "c->a:40"],
  );
});

test("POST /expenses classifies a title when category is omitted", async () => {
  asUser(() =>
    loadTrip([
      traveler("a", "A", "US", "zelle"),
      traveler("b", "B", "US", "zelle"),
    ]),
  );
  const { status, body } = await json("/expenses", {
    method: "POST",
    body: JSON.stringify({
      payerId: "a",
      participantIds: ["a", "b"],
      amount: 24,
      currency: "USD",
      description: "Grab to the airport",
    }),
  });
  assert.equal(status, 200, body.message);
  assert.equal(body.expense.category, "transport");

  const override = await json("/expenses", {
    method: "POST",
    body: JSON.stringify({
      payerId: "a",
      participantIds: ["a", "b"],
      amount: 12,
      currency: "USD",
      description: "Dinner",
      category: "transport",
    }),
  });
  assert.equal(override.status, 200, override.body.message);
  assert.equal(override.body.expense.category, "transport");
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
  assert.equal(created.body.entity.linkedRailAliases[0].railType, "PayNow");
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

test("POST /engine/run rejects an empty trip", async () => {
  const { status, body } = await json("/engine/run", { method: "POST" });
  assert.equal(status, 400);
  assert.match(body.message, /shared expense/i);
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

test("GET /claim/:token works without a session cookie", async () => {
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
  const { status, body } = await json(`/claim/${token}`, undefined, false);
  assert.equal(status, 200);
  assert.ok(body.recipient);
  assert.ok(Array.isArray(body.payoutOptions));
});

test("GET /scenario requires sign-in", async () => {
  const { status, body } = await json("/scenario", undefined, false);
  assert.equal(status, 401);
  assert.equal(body.success, false);
});

test("POST /obligations/:id/rail overrides the chosen rail", async () => {
  asUser(() => seedStore());
  await json("/engine/run", { method: "POST" });
  const scenario = await json("/scenario");
  const local = scenario.body.netObligations.find(
    (o: { chosenRail?: string }) => o.chosenRail === "local",
  );
  assert.ok(local);
  const { status, body } = await json(`/obligations/${local.id}/rail`, {
    method: "POST",
    body: JSON.stringify({ railName: "USDC Bridge (Circle)" }),
  });
  assert.equal(status, 200, body.message);
  assert.equal(body.obligation.chosenRail, "stable_bridge");
});

test("GET /health is public", async () => {
  const { status, body } = await json("/health", undefined, false);
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.service, "litefx");
});

test("POST /engine/run rejects an empty trip and a second run", async () => {
  const empty = await json("/engine/run", { method: "POST" });
  assert.equal(empty.status, 400);
  asUser(() => seedStore());
  const first = await json("/engine/run", { method: "POST" });
  assert.equal(first.status, 200);
  const second = await json("/engine/run", { method: "POST" });
  assert.equal(second.status, 409);
});

test("failed settle and claim use error status codes", async () => {
  const missing = await json("/settlement/net-missing/settle", {
    method: "POST",
  });
  assert.equal(missing.status, 404);
  const claim = await json("/claim/cl_missing/claim", {
    method: "POST",
    body: JSON.stringify({ payoutMethod: "GrabPay" }),
  });
  assert.equal(claim.status, 404);
});

test("cookie mutations without the request header are blocked", async () => {
  const res = await fetch(`${base}/clear`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: sessionCookie,
    },
  });
  assert.equal(res.status, 403);
  const blocked = (await res.json()) as { message: string };
  assert.match(blocked.message, /cross-origin/i);
});

test("POST /entities/:id/link-account turns Eve's claim into local PayNow", async () => {
  asUser(() => seedStore());
  await json("/engine/run", { method: "POST" });
  const { status, body } = await json("/entities/ent-eve/link-account", {
    method: "POST",
    body: "{}",
  });
  assert.equal(status, 200, body.message);
  assert.equal(body.entity.linkedRailAliases[0].railType, "PayNow");
  const scenario = await json("/scenario");
  const eve = scenario.body.netObligations.find(
    (o: { to: string }) => o.to === "ent-eve",
  );
  assert.equal(eve.chosenRail, "local");
});

test("trips can be created, renamed, switched, and listed in scenario", async () => {
  const created = await json("/trips", {
    method: "POST",
    body: JSON.stringify({ name: "Tokyo 2026" }),
  });
  assert.equal(created.status, 200, created.body.message);
  assert.equal(created.body.trip.name, "Tokyo 2026");
  assert.equal(created.body.trips.length, 2);

  const scenario = await json("/scenario");
  assert.equal(scenario.body.trip.name, "Tokyo 2026");
  assert.equal(scenario.body.entities.length, 0);

  const renamed = await json(`/trips/${created.body.trip.id}`, {
    method: "PATCH",
    body: JSON.stringify({ name: "Osaka weekend" }),
  });
  assert.equal(renamed.status, 200, renamed.body.message);
  assert.equal(renamed.body.trip.name, "Osaka weekend");

  const other = renamed.body.trips.find(
    (t: { id: string }) => t.id !== created.body.trip.id,
  );
  assert.ok(other);
  const selected = await json(`/trips/${other.id}/select`, { method: "POST" });
  assert.equal(selected.status, 200);
  const opened = await json("/scenario");
  assert.equal(opened.body.trip.id, other.id);

  const removed = await json(`/trips/${created.body.trip.id}`, {
    method: "DELETE",
  });
  assert.equal(removed.status, 200, removed.body.message);
  assert.equal(removed.body.trips.length, 1);
});
