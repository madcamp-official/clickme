import { createHmac, timingSafeEqual } from "node:crypto";

import type { NextRequest, NextResponse } from "next/server";

import { getVisitorHashSecret } from "./env";
import type { VisitorIdentity } from "./visitor";

export const SESSION_COOKIE_NAME = "clickme_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function signature(sessionId: string, visitorId: string): string {
  return createHmac("sha256", getVisitorHashSecret())
    .update(`clickme-session:v1:${visitorId}:${sessionId}`, "utf8")
    .digest("base64url");
}

export function createSessionCookieValue(sessionId: string, visitorId: string): string {
  if (!UUID_PATTERN.test(sessionId)) throw new Error("Invalid session id");
  return `${sessionId.toLowerCase()}.${signature(sessionId.toLowerCase(), visitorId)}`;
}

export function readSessionId(request: NextRequest, visitor: VisitorIdentity): string | null {
  const value = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!value) return null;
  const separator = value.indexOf(".");
  if (separator < 0 || separator !== value.lastIndexOf(".")) return null;
  const sessionId = value.slice(0, separator).toLowerCase();
  const received = value.slice(separator + 1);
  if (!UUID_PATTERN.test(sessionId) || !/^[A-Za-z0-9_-]{43}$/.test(received)) return null;
  const expected = signature(sessionId, visitor.id);
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? sessionId : null;
}

export function csrfToken(sessionId: string, visitorId: string): string {
  return createHmac("sha256", getVisitorHashSecret())
    .update(`clickme-csrf:v1:${visitorId}:${sessionId}`, "utf8")
    .digest("base64url");
}

export function hasValidCsrf(request: NextRequest, sessionId: string, visitorId: string): boolean {
  const received = request.headers.get("x-clickme-csrf")?.trim();
  if (!received) return false;
  const expected = csrfToken(sessionId, visitorId);
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function setSessionCookie(
  response: NextResponse,
  sessionId: string,
  expiresAt: string,
  serverTime: string,
  visitor: VisitorIdentity,
): void {
  const expires = new Date(expiresAt);
  const remainingSeconds = Math.max(
    1,
    Math.ceil((expires.getTime() - new Date(serverTime).getTime()) / 1_000),
  );
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: createSessionCookieValue(sessionId, visitor.id),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
    maxAge: remainingSeconds,
  });
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
