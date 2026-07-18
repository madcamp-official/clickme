import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

import type { NextRequest, NextResponse } from "next/server";

import { getVisitorHashSecret } from "./env";

export const VISITOR_COOKIE_NAME = "clickme_visitor";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type VisitorIdentity = {
  cookieValue: string;
  hash: string;
  id: string;
  shouldSetCookie: boolean;
};

export function normalizeVisitorId(value: string | undefined): string | null {
  if (!value || !UUID_PATTERN.test(value)) {
    return null;
  }
  return value.toLowerCase();
}

export function hashVisitorId(visitorId: string, secret: string): string {
  return createHmac("sha256", secret).update(visitorId, "utf8").digest("hex");
}

function signVisitorId(visitorId: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`clickme-cookie:v1:${visitorId}`, "utf8")
    .digest("base64url");
}

function visitorIdFromBootstrap(bootstrapId: string, secret: string): string {
  const bytes = createHmac("sha256", secret)
    .update(`clickme-bootstrap-visitor:v1:${bootstrapId.toLowerCase()}`, "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createVisitorCookieValue(visitorId: string, secret: string): string {
  const normalized = normalizeVisitorId(visitorId);
  if (!normalized) {
    throw new Error("Cannot sign an invalid visitor id");
  }
  return `${normalized}.${signVisitorId(normalized, secret)}`;
}

export function parseVisitorCookieValue(value: string | undefined, secret: string): string | null {
  if (!value) return null;

  const separator = value.indexOf(".");
  if (separator < 0 || separator !== value.lastIndexOf(".")) return null;

  const visitorId = normalizeVisitorId(value.slice(0, separator));
  const signature = value.slice(separator + 1);
  if (!visitorId || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;

  const expected = signVisitorId(visitorId, secret);
  const receivedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (
    receivedBuffer.length !== expectedBuffer.length
    || !timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return null;
  }

  return visitorId;
}

export function getClientAddress(request: Request): string {
  const normalizedProxyIp = request.headers.get("x-clickme-client-ip")?.trim();
  if (process.env.NODE_ENV === "production") {
    return normalizedProxyIp && isIP(normalizedProxyIp) ? normalizedProxyIp : "unknown";
  }

  if (normalizedProxyIp && isIP(normalizedProxyIp)) return normalizedProxyIp;
  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp && isIP(cloudflareIp)) return cloudflareIp;

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp && isIP(realIp)) return realIp;

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const addresses = forwardedFor.split(",").map((value) => value.trim());
    // cloudflared reaches this app over loopback. Cloudflare's client address is
    // the first valid entry, while later entries are intermediary proxies.
    for (const address of addresses) {
      if (isIP(address)) return address;
    }
  }

  return "unknown";
}

export function hashNetworkIdentity(request: Request, secret: string): string {
  const address = getClientAddress(request);
  return createHmac("sha256", secret)
    .update(`clickme-network:v1:${address}`, "utf8")
    .digest("hex");
}

export function getNetworkIdentityHash(request: Request): string {
  return hashNetworkIdentity(request, getVisitorHashSecret());
}

export function getVisitorIdentity(request: NextRequest, bootstrapId?: string): VisitorIdentity {
  const secret = getVisitorHashSecret();
  const existing = parseVisitorCookieValue(
    request.cookies.get(VISITOR_COOKIE_NAME)?.value,
    secret,
  );
  const normalizedBootstrapId = normalizeVisitorId(bootstrapId);
  const id = existing
    ?? (normalizedBootstrapId ? visitorIdFromBootstrap(normalizedBootstrapId, secret) : randomUUID());

  return {
    cookieValue: createVisitorCookieValue(id, secret),
    id,
    hash: hashVisitorId(id, secret),
    shouldSetCookie: existing === null,
  };
}

export function setVisitorCookie(response: NextResponse, visitor: VisitorIdentity): void {
  if (!visitor.shouldSetCookie) {
    return;
  }

  response.cookies.set({
    name: VISITOR_COOKIE_NAME,
    value: visitor.cookieValue,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}
