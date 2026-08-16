import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response, NextFunction } from "express";
import {
  addSession,
  addUser,
  deleteSessionByTokenHash,
  findSessionByTokenHash,
  findUserByEmail,
  findUserById,
  pruneExpiredSessions,
  runAsUser,
  toPublicUser,
  type PublicUser,
  type UserRecord,
} from "./store.js";

const scryptAsync = promisify(scrypt);

export const SESSION_COOKIE = "litefx_sid";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const AUTH_RATE_MAX = 12;
const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AuthedRequest = Request & { user?: PublicUser };

const loginFails = new Map<string, { n: number; until: number }>();
const rateBuckets = new Map<string, number[]>();
const pendingRegistrations = new Set<string>();

export function resetAuthLimits(): void {
  loginFails.clear();
  rateBuckets.clear();
  pendingRegistrations.clear();
}

export function clientIp(req: Request): string {
  return req.socket.remoteAddress || "unknown";
}

function allowRate(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const next = (rateBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (next.length >= max) {
    rateBuckets.set(key, next);
    return false;
  }
  next.push(now);
  rateBuckets.set(key, next);
  return true;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const buf = (await scryptAsync(password, salt, 32)) as Buffer;
  return `scrypt:${salt.toString("hex")}:${buf.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const actual = (await scryptAsync(
      password,
      salt,
      expected.length,
    )) as Buffer;
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateEmail(email: string): string | null {
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return "Enter a valid email address.";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 10 || password.length > 200) {
    return "Use 10–200 characters with a letter and a number.";
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Use 10–200 characters with a letter and a number.";
  }
  return null;
}

export function validateName(name: string): string | null {
  const trimmed = name.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    return "Name must be 1–80 characters.";
  }
  return null;
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function setSessionCookie(res: Response, token: string): void {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_MS / 1000)}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(res: Response): void {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
}

function tokenFromRequest(req: Request): string | undefined {
  const bearer = req.headers.authorization;
  if (
    typeof bearer === "string" &&
    bearer.toLowerCase().startsWith("bearer ")
  ) {
    const t = bearer.slice(7).trim();
    if (t) return t;
  }
  return readCookie(req, SESSION_COOKIE);
}

export function userFromRequest(req: Request): PublicUser | undefined {
  const token = tokenFromRequest(req);
  if (!token) return;
  pruneExpiredSessions();
  const session = findSessionByTokenHash(hashToken(token));
  if (!session) return;
  const user = findUserById(session.userId);
  if (!user) return;
  return toPublicUser(user);
}

export function createSessionFor(user: { id: string }): string {
  const token = newSessionToken();
  const now = new Date();
  addSession({
    id: newId("ses"),
    userId: user.id,
    tokenHash: hashToken(token),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_MS).toISOString(),
  });
  return token;
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ user: PublicUser } | { error: string; status: number }> {
  const nameErr = validateName(input.name);
  if (nameErr) return { error: nameErr, status: 400 };
  const email = normalizeEmail(input.email);
  const emailErr = validateEmail(email);
  if (emailErr) return { error: emailErr, status: 400 };
  const passErr = validatePassword(input.password);
  if (passErr) return { error: passErr, status: 400 };
  if (pendingRegistrations.has(email) || findUserByEmail(email)) {
    return { error: "An account with this email already exists.", status: 409 };
  }
  pendingRegistrations.add(email);
  try {
    const user: UserRecord = {
      id: newId("usr"),
      email,
      name: input.name.replace(/[\u0000-\u001F\u007F]/g, "").trim(),
      passwordHash: await hashPassword(input.password),
      createdAt: new Date().toISOString(),
    };
    if (findUserByEmail(email)) {
      return {
        error: "An account with this email already exists.",
        status: 409,
      };
    }
    addUser(user);
    return { user: toPublicUser(user) };
  } finally {
    pendingRegistrations.delete(email);
  }
}

export async function authenticateUser(
  emailRaw: string,
  password: string,
): Promise<{ user: PublicUser } | { error: string; status: number }> {
  const email = normalizeEmail(emailRaw);
  const lock = loginFails.get(email);
  if (lock && lock.until > Date.now()) {
    return {
      error: "Too many sign-in attempts. Try again in a few minutes.",
      status: 429,
    };
  }
  const user = findUserByEmail(email);
  const dummyHash =
    "scrypt:00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000";
  const ok = await verifyPassword(password, user?.passwordHash ?? dummyHash);
  if (!user || !ok) {
    const prev = loginFails.get(email) ?? { n: 0, until: 0 };
    const n = prev.n + 1;
    loginFails.set(email, {
      n,
      until: n >= LOGIN_MAX_ATTEMPTS ? Date.now() + LOGIN_WINDOW_MS : 0,
    });
    return { error: "Invalid email or password.", status: 401 };
  }
  loginFails.delete(email);
  return { user: toPublicUser(user) };
}

export function authRateOk(req: Request): boolean {
  return allowRate(`auth:${clientIp(req)}`, AUTH_RATE_MAX, AUTH_RATE_WINDOW_MS);
}

export function claimRateOk(req: Request, token: string): boolean {
  const tokenKey = hashToken(token).slice(0, 16);
  return allowRate(
    `claim:${clientIp(req)}:${tokenKey}`,
    20,
    AUTH_RATE_WINDOW_MS,
  );
}

export function sessionMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const user = userFromRequest(req);
  (req as AuthedRequest).user = user;
  if (user) {
    runAsUser(user.id, () => next());
    return;
  }
  next();
}

function isPublicApi(req: Request): boolean {
  const p = req.path;
  if (p === "/health") return true;
  if (p.startsWith("/auth/")) return true;
  if (p.startsWith("/claim/")) return true;
  return false;
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isPublicApi(req)) {
    next();
    return;
  }
  if (!(req as AuthedRequest).user) {
    res.status(401).json({ success: false, message: "Sign in required." });
    return;
  }
  next();
}

export function csrfOk(req: Request): boolean {
  if (
    req.method === "GET" ||
    req.method === "HEAD" ||
    req.method === "OPTIONS"
  ) {
    return true;
  }
  const origin = req.headers.origin;
  if (!origin) {
    if (!readCookie(req, SESSION_COOKIE)) return true;
    return req.headers["x-litefx-request"] === "1";
  }
  try {
    const url = new URL(origin);
    const host = req.headers.host;
    if (host && url.host === host) return true;
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function csrfGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (csrfOk(req)) {
    next();
    return;
  }
  res
    .status(403)
    .json({ success: false, message: "Blocked cross-origin request." });
}

export function securityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.setHeader("X-DNS-Prefetch-Control", "off");
  next();
}

export function currentUser(req: Request): PublicUser | undefined {
  return (req as AuthedRequest).user;
}

export { findUserById };
