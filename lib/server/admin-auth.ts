import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { NextRequest, NextResponse } from "next/server";

import { getAdminPassword, getVisitorHashSecret } from "./env";

export const ADMIN_SESSION_COOKIE_NAME = "clickme_admin_session";

const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const LOGIN_TRACKER_MAX_ENTRIES = 10_000;

const loginAttempts = new Map<string, { count: number; windowStartedAt: number }>();

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

// Compare fixed-length digests (not the raw strings) so timingSafeEqual never
// short-circuits on the candidate's length, which would otherwise leak the
// real password's length to a timing attacker.
export function verifyAdminPassword(candidate: string): boolean {
  return timingSafeEqual(digest(candidate), digest(getAdminPassword()));
}

function sessionSignature(expiresAtMs: number): string {
  return createHmac("sha256", getVisitorHashSecret())
    .update(`clickme-admin-session:v1:${expiresAtMs}`, "utf8")
    .digest("base64url");
}

export function createAdminSessionCookieValue(): { value: string; expiresAtMs: number } {
  const expiresAtMs = Date.now() + SESSION_DURATION_MS;
  return { value: `${expiresAtMs}.${sessionSignature(expiresAtMs)}`, expiresAtMs };
}

export function isValidAdminSessionCookie(value: string | undefined | null): boolean {
  if (!value) return false;

  const separator = value.indexOf(".");
  if (separator < 0 || separator !== value.lastIndexOf(".")) return false;

  const expiresAtMs = Number(value.slice(0, separator));
  const signature = value.slice(separator + 1);
  if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= Date.now()) return false;
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;

  const expected = sessionSignature(expiresAtMs);
  const receivedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function hasValidAdminSession(request: NextRequest): boolean {
  return isValidAdminSessionCookie(request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value);
}

function adminCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

export function setAdminSessionCookie(response: NextResponse): void {
  const { value, expiresAtMs } = createAdminSessionCookieValue();
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE_NAME,
    value,
    ...adminCookieOptions(),
    expires: new Date(expiresAtMs),
  });
}

export function clearAdminSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE_NAME,
    value: "",
    ...adminCookieOptions(),
    maxAge: 0,
  });
}

function pruneOldestLoginTracker(): void {
  const oldest = loginAttempts.keys().next().value;
  if (oldest) loginAttempts.delete(oldest);
}

export function isLoginRateLimited(networkHash: string): boolean {
  const entry = loginAttempts.get(networkHash);
  if (!entry) return false;
  if (Date.now() - entry.windowStartedAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(networkHash);
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

export function recordLoginFailure(networkHash: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(networkHash);
  if (!entry || now - entry.windowStartedAt > LOGIN_WINDOW_MS) {
    if (!entry && loginAttempts.size >= LOGIN_TRACKER_MAX_ENTRIES) pruneOldestLoginTracker();
    loginAttempts.set(networkHash, { count: 1, windowStartedAt: now });
    return;
  }
  entry.count += 1;
}

export function clearLoginFailures(networkHash: string): void {
  loginAttempts.delete(networkHash);
}
