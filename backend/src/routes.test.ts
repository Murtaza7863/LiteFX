import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { apiRouter } from "./routes.js";
import { pagesRouter } from "./pages.js";
import { clearStore, seedStore } from "./store.js";
import { loadTrip, traveler } from "./testUtil.js";

let server: Server;
let base = "";

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
  clearStore();
});

async function json(path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return { status: res.status, body: await res.json() };
}

test("POST /entities requires name and country", async () => {
  const { status, body } = await json("/entities", {
    method: "POST",
    body: JSON.stringify({ name: "Sam" }),
  });
  assert.equal(status, 400);
  assert.equal(body.success, false);
});

test("POST /expenses rejects an empty participant list", async () => {
  loadTrip([traveler("a", "A", "US", "zelle")]);
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
  loadTrip([traveler("a", "A", "US", "zelle")]);
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
  seedStore();
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
  seedStore();
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
  const { getStore } = await import("./store.js");
  const link = getStore().claimLinks.find((c) => c.token === token)!;
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
