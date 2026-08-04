/**
 * Single-password admin auth.
 *
 * No accounts, no email, no OAuth. One shared password in ADMIN_PASSWORD, a
 * signed JWT in an httpOnly cookie, and a short in-memory backoff on failed
 * attempts.
 */

import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "swj_session";
const SESSION_DAYS = 7;
const ISSUER = "swjafar";

export function isAuthConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD);
}

/**
 * Sessions are signed with AUTH_SECRET when present, otherwise with a key
 * derived from the password. The derived case means changing the password
 * invalidates every existing session, which is the behaviour you want anyway.
 */
function signingKey() {
  const secret =
    process.env.AUTH_SECRET ?? `derived:${process.env.ADMIN_PASSWORD ?? ""}`;
  return createHash("sha256").update(secret).digest();
}

function constantTimeEquals(a: string, b: string) {
  // Hashing first keeps the comparison length-independent.
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

const attempts = new Map<string, { count: number; blockedUntil: number }>();
const MAX_ATTEMPTS = 6;
const BLOCK_MS = 5 * 60 * 1000;

/**
 * Best-effort throttle. Serverless instances are ephemeral, so this slows down
 * a casual attacker rather than a determined one; the password itself is the
 * real control.
 */
export function checkRateLimit(key: string) {
  const record = attempts.get(key);
  if (!record) return { allowed: true as const };
  if (record.blockedUntil > Date.now()) {
    const seconds = Math.ceil((record.blockedUntil - Date.now()) / 1000);
    return { allowed: false as const, retryInSeconds: seconds };
  }
  return { allowed: true as const };
}

function recordFailure(key: string) {
  const record = attempts.get(key) ?? { count: 0, blockedUntil: 0 };
  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) {
    record.blockedUntil = Date.now() + BLOCK_MS;
    record.count = 0;
  }
  attempts.set(key, record);
}

function clearFailures(key: string) {
  attempts.delete(key);
}

/**
 * Check the admin password without opening a new session.
 * Used for sensitive actions like restoring a revision.
 */
export function verifyAdminPassword(
  password: string,
  rateLimitKey: string,
):
  | { ok: true }
  | { ok: false; reason: "unconfigured" | "invalid" | "rate-limited"; retryInSeconds?: number } {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return { ok: false, reason: "unconfigured" };

  const limit = checkRateLimit(rateLimitKey);
  if (!limit.allowed) {
    return { ok: false, reason: "rate-limited", retryInSeconds: limit.retryInSeconds };
  }

  if (!password || !constantTimeEquals(password, expected)) {
    recordFailure(rateLimitKey);
    return { ok: false, reason: "invalid" };
  }

  clearFailures(rateLimitKey);
  return { ok: true };
}

export async function attemptLogin(password: string, rateLimitKey: string) {
  const check = verifyAdminPassword(password, rateLimitKey);
  if (!check.ok) {
    return check.reason === "rate-limited"
      ? {
          ok: false as const,
          reason: "rate-limited" as const,
          retryInSeconds: check.retryInSeconds,
        }
      : { ok: false as const, reason: check.reason };
  }

  await createSession();
  return { ok: true as const };
}

export async function createSession() {
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(signingKey());

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function hasValidSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, signingKey(), { issuer: ISSUER });
    return payload.role === "admin";
  } catch {
    return false;
  }
}
