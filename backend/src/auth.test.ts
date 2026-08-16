import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { apiRouter } from "./routes.js";
import { getApp, resetApp, runAsUser, seedStore } from "./store.js";
import { resetAuthLimits } from "./auth.js";

let server: Server;
let base = "";

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter);
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
});

async function json(path: string, init?: RequestInit & { cookie?: string }) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-litefx-request": "1",
      ...(init?.cookie ? { cookie: init.cookie } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const setCookie =
    res.headers.getSetCookie?.()[0] ?? res.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0] || init?.cookie || "";
  const body = await res.json();
  return { status: res.status, body, cookie };
}

test("signup rejects a weak password without creating a user", async () => {
  const { status, body } = await json("/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      name: "Ada",
      email: "ada@x.test",
      password: "short",
    }),
  });
  assert.equal(status, 400);
  assert.match(body.message, /10/);
  assert.equal(getApp().users.length, 0);
});

test("signup then login returns a session cookie", async () => {
  const created = await json("/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      name: "Ada Lovelace",
      email: "ada@x.test",
      password: "correcthorse1",
    }),
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.user.email, "ada@x.test");
  assert.equal(created.body.user.passwordHash, undefined);
  assert.match(created.cookie, /^litefx_sid=/);

  const me = await json("/auth/me", { cookie: created.cookie });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.name, "Ada Lovelace");
});

test("concurrent signups for the same email only create one user", async () => {
  const body = JSON.stringify({
    name: "Ada",
    email: "race@x.test",
    password: "correcthorse1",
  });
  const [a, b] = await Promise.all([
    json("/auth/signup", { method: "POST", body }),
    json("/auth/signup", { method: "POST", body }),
  ]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [201, 409]);
  assert.equal(
    getApp().users.filter((u) => u.email === "race@x.test").length,
    1,
  );
});

test("duplicate signup is rejected", async () => {
  const body = JSON.stringify({
    name: "Ada",
    email: "ada@x.test",
    password: "correcthorse1",
  });
  await json("/auth/signup", { method: "POST", body });
  const { status } = await json("/auth/signup", { method: "POST", body });
  assert.equal(status, 409);
});

test("login does not reveal whether the email exists", async () => {
  const missing = await json("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "nobody@x.test", password: "correcthorse1" }),
  });
  const created = await json("/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      name: "Ada",
      email: "ada@x.test",
      password: "correcthorse1",
    }),
  });
  const wrong = await json("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "ada@x.test", password: "wrong-password1" }),
  });
  assert.equal(missing.status, 401);
  assert.equal(wrong.status, 401);
  assert.equal(missing.body.message, wrong.body.message);
  assert.equal(created.status, 201);
});

test("users cannot see each other's trips", async () => {
  const ada = await json("/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      name: "Ada",
      email: "ada@x.test",
      password: "correcthorse1",
    }),
  });
  runAsUser(ada.body.user.id, () => seedStore());
  const adaTrip = await json("/scenario", { cookie: ada.cookie });
  assert.ok(adaTrip.body.entities.length > 0);

  const bob = await json("/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      name: "Bob",
      email: "bob@x.test",
      password: "correcthorse1",
    }),
  });
  const bobTrip = await json("/scenario", { cookie: bob.cookie });
  assert.equal(bobTrip.body.entities.length, 0);
});

test("logout revokes the session", async () => {
  const created = await json("/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      name: "Ada",
      email: "ada@x.test",
      password: "correcthorse1",
    }),
  });
  await json("/auth/logout", { method: "POST", cookie: created.cookie });
  const me = await json("/auth/me", { cookie: created.cookie });
  assert.equal(me.status, 401);
});

test("passwords are stored hashed", async () => {
  await json("/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      name: "Ada",
      email: "ada@x.test",
      password: "correcthorse1",
    }),
  });
  const stored = getApp().users[0];
  assert.ok(stored.passwordHash.startsWith("scrypt:"));
  assert.equal(stored.passwordHash.includes("correcthorse1"), false);
});
