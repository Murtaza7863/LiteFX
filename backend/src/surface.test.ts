import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { apiRouter } from "./routes.js";
import { pagesRouter } from "./pages.js";
import { COUNTRIES, payoutOptionsFor, railsFor } from "./data/countries.js";
import { EXPENSE_CATEGORY_IDS } from "./data/classifyExpense.js";
import { resetApp } from "./store.js";
import { resetAuthLimits } from "./auth.js";
import { assertScenarioCorridors } from "./testUtil.js";

let server: Server;
let base = "";
let origin = "";
let sessionCookie = "";

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
  origin = `http://127.0.0.1:${port}`;
  base = `${origin}/api`;
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
});

beforeEach(async () => {
  resetApp();
  resetAuthLimits();
  sessionCookie = "";
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
});

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

async function scenario(label = "") {
  const { status, body } = await json("/scenario");
  assert.equal(status, 200, body.message);
  assertScenarioCorridors(body, label);
  return body;
}

test("every listed API action a judge can click stays corridor-legal", async () => {
  const health = await json("/health", undefined, false);
  assert.equal(health.status, 200);

  await json("/seed", { method: "POST" });
  const engine = await json("/engine/run", { method: "POST" });
  assert.equal(engine.status, 200, engine.body.message);
  let body = await scenario("seeded");

  const netting = await json("/netting/run", { method: "POST" });
  assert.equal(netting.status, 200);
  const routing = await json("/routing/run", { method: "POST" });
  assert.equal(routing.status, 200);
  body = await scenario("re-net");

  for (const ob of body.netObligations) {
    for (const row of (ob.considered ?? []).filter(
      (r: { eligible?: boolean }) => r.eligible,
    )) {
      const over = await json(`/obligations/${ob.id}/rail`, {
        method: "POST",
        body: JSON.stringify({ railName: row.railName }),
      });
      assert.equal(over.status, 200, over.body.message);
      await scenario(`override ${ob.id} ${row.railName}`);
    }
  }

  for (const rail of railsFor("SG")) {
    const patched = await json("/entities/ent-alice", {
      method: "PATCH",
      body: JSON.stringify({ railType: rail }),
    });
    assert.equal(patched.status, 200, patched.body.message);
    assert.equal(patched.body.entity.linkedRailAliases[0].railType, rail);
    await scenario(`alice ${rail}`);
  }

  const renamed = await json("/entities/ent-alice", {
    method: "PATCH",
    body: JSON.stringify({
      name: "Alice Tan",
      contact: { type: "phone", value: "+65-9000-0000" },
    }),
  });
  assert.equal(renamed.status, 200);

  const unlinked = await json("/entities/ent-frank", {
    method: "PATCH",
    body: JSON.stringify({ railType: null }),
  });
  assert.equal(unlinked.status, 200);
  body = await scenario("unlink frank");
  for (const o of body.netObligations.filter(
    (o: { to: string }) => o.to === "ent-frank",
  )) {
    assert.equal(o.chosenRail, "claim_link");
  }

  const linked = await json("/entities/ent-frank/link-account", {
    method: "POST",
    body: "{}",
  });
  assert.equal(linked.status, 200, linked.body.message);
  await scenario("relink frank");

  const eveLink = await json("/entities/ent-eve/link-account", {
    method: "POST",
    body: "{}",
  });
  assert.equal(eveLink.status, 200);
  const home = await scenario("link eve");
  const homeTripId = home.trip.id as string;

  const crew = await json("/contacts/save-crew", { method: "POST" });
  assert.equal(crew.status, 200);
  const contactId = crew.body.contacts[0].id as string;

  const trip = await json("/trips", {
    method: "POST",
    body: JSON.stringify({ name: "Tokyo" }),
  });
  assert.equal(trip.status, 200);
  const added = await json("/entities", {
    method: "POST",
    body: JSON.stringify({ contactId }),
  });
  assert.equal(added.status, 200, added.body.message);
  const dup = await json(`/trips/${trip.body.trip.id}/duplicate`, {
    method: "POST",
  });
  assert.equal(dup.status, 200);
  const renamedTrip = await json(`/trips/${dup.body.trip.id}`, {
    method: "PATCH",
    body: JSON.stringify({ name: "Osaka" }),
  });
  assert.equal(renamedTrip.status, 200);
  await json(`/trips/${homeTripId}/select`, { method: "POST" });
  const deletedTrip = await json(`/trips/${dup.body.trip.id}`, {
    method: "DELETE",
  });
  assert.equal(deletedTrip.status, 200);
  const droppedContact = await json(`/contacts/${contactId}`, {
    method: "DELETE",
  });
  assert.equal(droppedContact.status, 200);

  const asNew = await json("/seed", {
    method: "POST",
    body: JSON.stringify({ asNew: true }),
  });
  assert.equal(asNew.status, 200);
  await json("/engine/run", { method: "POST" });
  const unlinkedEve = await json("/entities/ent-eve", {
    method: "PATCH",
    body: JSON.stringify({ railType: null }),
  });
  assert.equal(unlinkedEve.status, 200);
  body = await scenario("asNew unlink eve");

  const claimOb = body.netObligations.find(
    (o: { chosenRail?: string }) => o.chosenRail === "claim_link",
  );
  assert.ok(claimOb);
  const issued = await json(`/settlement/${claimOb.id}/settle`, {
    method: "POST",
  });
  assert.equal(issued.status, 200, issued.body.message);
  const token = issued.body.link.token as string;
  const claimGet = await json(`/claim/${token}`, undefined, false);
  assert.equal(claimGet.status, 200);
  const page = await fetch(`${origin}/claim/${token}`);
  assert.equal(page.status, 200);
  const claimed = await json(`/claim/${token}/claim`, {
    method: "POST",
    body: JSON.stringify({ payoutMethod: claimGet.body.payoutOptions[0] }),
  });
  assert.equal(claimed.status, 200, claimed.body.message);

  body = await scenario("after claim");
  for (const ob of body.netObligations.filter(
    (o: { status: string }) => o.status !== "settled",
  )) {
    const settled = await json(`/settlement/${ob.id}/settle`, {
      method: "POST",
    });
    assert.equal(settled.status, 200, settled.body.message);
  }

  const exp = body.expenses[0];
  const patchedExp = await json(`/expenses/${exp.id}`, {
    method: "PATCH",
    body: JSON.stringify({ amount: exp.amount + 1, category: "food" }),
  });
  assert.equal(patchedExp.status, 200);
  await json("/engine/run", { method: "POST" });
  await scenario("after expense edit");

  const removedExp = await json(`/expenses/${exp.id}`, { method: "DELETE" });
  assert.equal(removedExp.status, 200);
  const removedPerson = await json("/entities/ent-diana", {
    method: "DELETE",
  });
  assert.equal(removedPerson.status, 200);

  const cleared = await json("/clear", { method: "POST" });
  assert.equal(cleared.status, 200);
  await json("/auth/logout", { method: "POST" });
  const again = await json("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "ada@x.test",
      password: "correcthorse1",
    }),
  });
  assert.equal(again.status, 200, again.body.message);
});

test("PATCH every sample traveler to every country rebuilds a legal graph", async () => {
  const people = [
    "ent-alice",
    "ent-bob",
    "ent-charlie",
    "ent-diana",
    "ent-eve",
    "ent-frank",
  ];
  for (const id of people) {
    await json("/seed", { method: "POST" });
    const engine = await json("/engine/run", { method: "POST" });
    assert.equal(engine.status, 200, engine.body.message);
    for (const c of COUNTRIES) {
      const patched = await json(`/entities/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ country: c.code }),
      });
      assert.equal(
        patched.status,
        200,
        `${id} ${c.code}: ${patched.body.message}`,
      );
      assert.equal(patched.body.entity.country, c.code);
      await scenario(`${id}→${c.code}`);
    }
  }
});

test("POST a traveler in every country, then net a shared expense", async () => {
  const ids: string[] = [];
  for (const c of COUNTRIES) {
    const created = await json("/entities", {
      method: "POST",
      body: JSON.stringify({
        name: `Traveler ${c.code}`,
        country: c.code,
        railType: railsFor(c.code)[0],
      }),
    });
    assert.equal(created.status, 200, created.body.message);
    ids.push(created.body.entity.id);
  }
  const exp = await json("/expenses", {
    method: "POST",
    body: JSON.stringify({
      payerId: ids[0],
      participantIds: ids,
      amount: 650,
      currency: "USD",
      description: "Group dinner",
      category: "food",
    }),
  });
  assert.equal(exp.status, 200, exp.body.message);
  const engine = await json("/engine/run", { method: "POST" });
  assert.equal(engine.status, 200, engine.body.message);
  await scenario("all countries on one trip");
});

test("expense form settings: every category and split mode", async () => {
  const a = await json("/entities", {
    method: "POST",
    body: JSON.stringify({ name: "Ann", country: "US", railType: "Zelle" }),
  });
  const b = await json("/entities", {
    method: "POST",
    body: JSON.stringify({
      name: "Ben",
      country: "JP",
      railType: "Zengin",
    }),
  });
  const aid = a.body.entity.id as string;
  const bid = b.body.entity.id as string;
  const splits = [
    { mode: "equal" as const },
    { mode: "percent" as const, parts: { [aid]: 40, [bid]: 60 } },
    { mode: "amount" as const, parts: { [aid]: 8, [bid]: 12 } },
  ];
  for (const category of EXPENSE_CATEGORY_IDS) {
    for (const split of splits) {
      const created = await json("/expenses", {
        method: "POST",
        body: JSON.stringify({
          payerId: aid,
          participantIds: [aid, bid],
          amount: 20,
          currency: "USD",
          description: `${category} ${split.mode}`,
          category,
          split: split.parts
            ? { mode: split.mode, parts: split.parts }
            : { mode: "equal" },
        }),
      });
      assert.equal(
        created.status,
        200,
        `${category} ${split.mode}: ${created.body.message}`,
      );
    }
  }
  const engine = await json("/engine/run", { method: "POST" });
  assert.equal(engine.status, 200, engine.body.message);
  await scenario("expense settings");
});

test("claim every payout option for a recipient in every country", async () => {
  for (const c of COUNTRIES) {
    const opts = payoutOptionsFor(c.code);
    for (const opt of [opts[0], opts[opts.length - 1]]) {
      await json("/clear", { method: "POST" });
      const p = await json("/entities", {
        method: "POST",
        body: JSON.stringify({
          name: "Payer",
          country: "US",
          railType: "Zelle",
        }),
      });
      const r = await json("/entities", {
        method: "POST",
        body: JSON.stringify({ name: `Recv ${c.code}`, country: c.code }),
      });
      assert.equal(p.status, 200, p.body.message);
      assert.equal(r.status, 200, r.body.message);
      await json("/expenses", {
        method: "POST",
        body: JSON.stringify({
          payerId: r.body.entity.id,
          participantIds: [p.body.entity.id, r.body.entity.id],
          amount: 30,
          currency: "USD",
          description: "Taxi",
        }),
      });
      await json("/engine/run", { method: "POST" });
      const scene = await json("/scenario");
      const claimOb = scene.body.netObligations.find(
        (o: { to: string }) => o.to === r.body.entity.id,
      );
      assert.equal(claimOb?.chosenRail, "claim_link", c.code);
      const issued = await json(`/settlement/${claimOb.id}/settle`, {
        method: "POST",
      });
      const claimed = await json(`/claim/${issued.body.link.token}/claim`, {
        method: "POST",
        body: JSON.stringify({ payoutMethod: opt }),
      });
      assert.equal(
        claimed.status,
        200,
        `${c.code} ${opt}: ${claimed.body.message}`,
      );
    }
  }
});
