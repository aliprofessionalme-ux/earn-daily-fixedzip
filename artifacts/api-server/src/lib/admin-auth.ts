import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

const sessions = new Map<string, number>();
const csrfTokens = new Map<string, string>();

function secretValue() {
  const value = process.env["ADMIN_PASSWORD"];
  if (!value) throw new Error("ADMIN_PASSWORD is required");
  return value;
}

function sessionSecret() {
  const env = process.env["SESSION_SECRET"];
  if (process.env["NODE_ENV"] === "production") {
    if (!env) throw new Error("SESSION_SECRET is required in production.");
    return env;
  }
  return env ?? "dev-session-secret";
}

function sessionHash(token: string) {
  return createHash("sha256").update(`${token}:${sessionSecret()}`).digest("hex");
}

export function validateAdminPassword(input: string) {
  const expected = Buffer.from(secretValue());
  const actual = Buffer.from(input);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function createAdminSession() {
  const token = randomBytes(32).toString("hex");
  const hash = sessionHash(token);
  sessions.set(hash, Date.now() + 1000 * 60 * 60 * 12);
  csrfTokens.set(hash, randomBytes(32).toString("hex"));
  return token;
}

export function isAdminSession(token?: string) {
  if (!token) return false;
  const hash = sessionHash(token);
  const expiry = sessions.get(hash);
  if (!expiry) return false;
  if (expiry < Date.now()) {
    sessions.delete(hash);
    csrfTokens.delete(hash);
    return false;
  }
  return true;
}

export function getAdminCsrfToken(token?: string) {
  if (!token || !isAdminSession(token)) return "";
  const hash = sessionHash(token);
  let csrf = csrfTokens.get(hash);
  if (!csrf) {
    csrf = randomBytes(32).toString("hex");
    csrfTokens.set(hash, csrf);
  }
  return csrf;
}

export function validateAdminCsrfToken(sessionToken: string | undefined, submittedToken: string | undefined) {
  if (!sessionToken || !submittedToken || !isAdminSession(sessionToken)) return false;
  const expected = csrfTokens.get(sessionHash(sessionToken));
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(submittedToken);
  return a.length === b.length && timingSafeEqual(a, b);
}
