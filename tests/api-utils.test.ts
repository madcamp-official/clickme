import { createHmac } from "node:crypto";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as postComments } from "../app/api/comments/route";
import { GET as getHealth } from "../app/api/health/route";
import { GET as getNextRedirect } from "../app/api/next/route";
import {
  classifyReferrerHost,
  classifyTimeZone,
  classifyUtmMedium,
  classifyUtmSource,
  dimensionBucket,
  normalizeLanguage,
  normalizePath,
  normalizeReferralToken,
  opaqueAnalyticsLabel,
  validateEvents,
} from "../lib/server/analytics-validation";
import { CapacityGate, tryAcquireDatabase } from "../lib/server/capacity";
import { isCommentBodyAllowed } from "../lib/server/comment-filter";
import { isChoice } from "../lib/server/contracts";
import { readBoundedJsonObject, readJsonObject, rejectUnsafeMutation } from "../lib/server/http";
import { createReferralReceipt, verifyReferralReceipt } from "../lib/server/referral-receipt";
import { createSessionCookieValue, csrfToken, isUuid } from "../lib/server/session-cookie";
import { createShareToken, hashShareToken } from "../lib/server/shares";
import { getClientAddress, getVisitorIdentity, hashVisitorId, normalizeVisitorId } from "../lib/server/visitor";
import { formatVoteResults } from "../lib/server/votes";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("API input validation", () => {
  it("accepts only the public vote choices", () => {
    expect(isChoice("dip")).toBe(true);
    expect(isChoice("pour")).toBe(true);
    expect(isChoice("찍먹")).toBe(false);
    expect(isChoice(null)).toBe(false);
  });

  it("rejects malformed, non-object, and oversized JSON", async () => {
    const valid = new Request("http://localhost/api/vote", {
      method: "POST",
      body: JSON.stringify({ choice: "dip" }),
    });
    expect(await readJsonObject(valid)).toEqual({ choice: "dip" });

    const malformed = new Request("http://localhost/api/vote", {
      method: "POST",
      body: "{",
    });
    expect(await readJsonObject(malformed)).toBeNull();

    const array = new Request("http://localhost/api/vote", {
      method: "POST",
      body: "[]",
    });
    expect(await readJsonObject(array)).toBeNull();

    const oversized = new Request("http://localhost/api/analytics/events", {
      method: "POST",
      body: JSON.stringify({ body: "x".repeat(2_100) }),
    });
    expect(await readJsonObject(oversized)).toBeNull();
  });

  it("stops a streamed request when its byte limit is crossed", async () => {
    const request = new Request("http://localhost/api/events", {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"value":"'));
          controller.enqueue(new TextEncoder().encode("x".repeat(100)));
          controller.enqueue(new TextEncoder().encode('"}'));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect(await readBoundedJsonObject(request, 32)).toEqual({ ok: false, reason: "too_large" });
  });

  it("requires the configured origin for JSON mutations", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://clickme.example";
    const accepted = new Request("https://clickme.example/api/vote", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://clickme.example" },
      body: "{}",
    });
    const rejected = new Request("https://clickme.example/api/vote", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example" },
      body: "{}",
    });
    expect(rejectUnsafeMutation(accepted)).toBeNull();
    expect(rejectUnsafeMutation(rejected)?.status).toBe(403);
  });

  it("fails closed when the production origin is not configured", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    const request = new Request("https://clickme.example/api/vote", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://clickme.example",
        "sec-fetch-site": "same-origin",
      },
      body: "{}",
    });

    const response = rejectUnsafeMutation(request);
    expect(response?.status).toBe(503);
  });
});

describe("outbound redirect", () => {
  it("does not cache and redirects to the configured destination", () => {
    const response = getNextRedirect();

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://seojiny.com/");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
});

describe("comments endpoint validation", () => {
  it("rejects a malformed comment request before touching the database", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://clickme.example";
    const request = new NextRequest("https://clickme.example/api/comments", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://clickme.example" },
      body: JSON.stringify({
        choice: "dip",
        requestId: "not-a-uuid",
        sessionId: "123e4567-e89b-42d3-a456-426614174001",
        pageViewId: "123e4567-e89b-42d3-a456-426614174010",
        body: "안녕하세요",
      }),
    });
    const response = await postComments(request);
    expect(response.status).toBe(400);
  });

  it("rejects a comment body over 240 characters before touching the database", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://clickme.example";
    const request = new NextRequest("https://clickme.example/api/comments", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://clickme.example" },
      body: JSON.stringify({
        choice: "dip",
        requestId: "123e4567-e89b-42d3-a456-426614174099",
        sessionId: "123e4567-e89b-42d3-a456-426614174001",
        pageViewId: "123e4567-e89b-42d3-a456-426614174010",
        body: "x".repeat(241),
      }),
    });
    const response = await postComments(request);
    expect(response.status).toBe(400);
  });

  it("rejects a comment body caught by the content filter before touching the database", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://clickme.example";
    const request = new NextRequest("https://clickme.example/api/comments", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://clickme.example" },
      body: JSON.stringify({
        choice: "dip",
        requestId: "123e4567-e89b-42d3-a456-426614174098",
        sessionId: "123e4567-e89b-42d3-a456-426614174001",
        pageViewId: "123e4567-e89b-42d3-a456-426614174010",
        body: "이 카드 진짜 개새끼같이 못생겼다",
      }),
    });
    const response = await postComments(request);
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe("COMMENT_REJECTED");
  });
});

describe("comment content filter", () => {
  it("allows ordinary comments", () => {
    expect(isCommentBodyAllowed("카리나 비주얼 실화냐 진짜 예쁘다")).toBe(true);
    expect(isCommentBodyAllowed("장원영 웃음 너무 좋아요 ㅎㅎ")).toBe(true);
  });

  it("blocks Korean profanity, including symbol-obfuscated forms", () => {
    expect(isCommentBodyAllowed("이거 진짜 씨발 못생겼다")).toBe(false);
    expect(isCommentBodyAllowed("시*발 이게 뭐야")).toBe(false);
    expect(isCommentBodyAllowed("병신같은 소리하네")).toBe(false);
  });

  it("blocks English profanity and slurs case-insensitively", () => {
    expect(isCommentBodyAllowed("this is FUCK ugly")).toBe(false);
    expect(isCommentBodyAllowed("what a Bitch")).toBe(false);
  });

  it("does not flag benign text that merely contains a space near a banned word", () => {
    // "씨 발표" (Mx. Bal's presentation) must not collapse into "씨발표" via
    // real whitespace -- only symbol-based obfuscation is collapsed.
    expect(isCommentBodyAllowed("아 씨 발표 진짜 잘했다")).toBe(true);
  });

  it("blocks links, emails, and phone numbers", () => {
    expect(isCommentBodyAllowed("여기 놀러와 https://example.com/promo")).toBe(false);
    expect(isCommentBodyAllowed("문의는 test@example.com 로 주세요")).toBe(false);
    expect(isCommentBodyAllowed("연락처 010-1234-5678 남겨요")).toBe(false);
    expect(isCommentBodyAllowed("제 사이트 example.kr 놀러오세요")).toBe(false);
  });
});

describe("retired and public endpoints", () => {
  it("serves liveness without exposing a database state field", async () => {
    const response = getHealth();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body).not.toHaveProperty("database");
  });
});

describe("analytics minimization", () => {
  const pageViewId = "123e4567-e89b-42d3-a456-426614174010";

  it("normalizes referral paths without retaining the token", () => {
    expect(normalizePath("/r/abcdefghijklmnopqrstuv")).toBe("/r/:token");
    expect(normalizePath("/r/not-valid")).toBeNull();
    expect(normalizeReferralToken("abcdefghijklmnopqrstuv")).toBe("abcdefghijklmnopqrstuv");
    expect(normalizeReferralToken("short")).toBeNull();
  });

  it("accepts only allowlisted event properties", () => {
    const base = {
      id: "123e4567-e89b-42d3-a456-426614174011",
      name: "share_cta_clicked",
      occurredAt: new Date().toISOString(),
    };
    expect(validateEvents([
      { ...base, properties: { choice: "dip", variant: "A" } },
    ], pageViewId, isUuid)).toHaveLength(1);
    expect(validateEvents([
      { ...base, properties: { choice: "dip", rawUrl: "https://example.test/?secret=1" } },
    ], pageViewId, isUuid)).toBeNull();
    expect(validateEvents([
      { ...base, properties: { choice: "cookie=canary", variant: "A" } },
    ], pageViewId, isUuid)).toBeNull();
    expect(validateEvents([
      { ...base, name: "referral_banner_impression", properties: {} },
    ], pageViewId, isUuid)).toHaveLength(1);
    expect(validateEvents([
      { ...base, name: "referral_banner_impression", properties: { choice: "dip" } },
    ], pageViewId, isUuid)).toBeNull();
    expect(validateEvents([
      { ...base, properties: { choice: "dip", constructor: "x" } },
    ], pageViewId, isUuid)).toBeNull();
    expect(validateEvents([
      { ...base, properties: JSON.parse('{"choice":"dip","__proto__":"x"}') },
    ], pageViewId, isUuid)).toBeNull();
  });

  it("stores only low-cardinality acquisition and device classifications", () => {
    const canary = "cookie=visitor-secret&ip=203.0.113.10";
    const opaque = opaqueAnalyticsLabel(canary, "campaign", "s".repeat(32));

    expect(classifyReferrerHost("news.unlisted-canary.example", "clickme.example")).toBe("external");
    expect(classifyReferrerHost("clickme.example", "clickme.example")).toBe("self");
    expect(classifyUtmSource(canary)).toBe("other");
    expect(classifyUtmSource("kakaotalk")).toBe("kakao");
    expect(classifyUtmMedium(canary)).toBe("other");
    expect(opaque).toMatch(/^h_[0-9a-f]{24}$/);
    expect(opaque).not.toContain(canary);
    expect(classifyTimeZone("America/Canary")).toBe("Other");
    expect(normalizeLanguage("ko-KR")).toBe("ko");
    expect(normalizeLanguage("fr-CA")).toBe("Other");
    expect(dimensionBucket(393)).toBe(1);
    expect(dimensionBucket(1920)).toBe(5);
  });
});

describe("database capacity", () => {
  it("fails fast when a category is full and releases both gates", () => {
    const category = new CapacityGate(2);
    const first = tryAcquireDatabase(category);
    const second = tryAcquireDatabase(category);
    expect(first).toBeTypeOf("function");
    expect(second).toBeTypeOf("function");
    expect(tryAcquireDatabase(category)).toBeNull();
    first?.();
    const replacement = tryAcquireDatabase(category);
    expect(replacement).toBeTypeOf("function");
    replacement?.();
    second?.();
  });

  it("keeps explicitly reserved slots unavailable to lower-priority work", () => {
    const gate = new CapacityGate(4);
    const first = gate.tryAcquire(2);
    const second = gate.tryAcquire(2);
    expect(first).toBeTypeOf("function");
    expect(second).toBeTypeOf("function");
    expect(gate.tryAcquire(2)).toBeNull();
    const critical = gate.tryAcquire();
    expect(critical).toBeTypeOf("function");
    critical?.();
    first?.();
    second?.();
  });
});

describe("visitor identity protection", () => {
  const visitorId = "123e4567-e89b-42d3-a456-426614174000";

  it("normalizes valid UUIDs and rejects arbitrary cookie values", () => {
    expect(normalizeVisitorId(visitorId.toUpperCase())).toBe(visitorId);
    expect(normalizeVisitorId("not-a-uuid")).toBeNull();
    expect(normalizeVisitorId(undefined)).toBeNull();
  });

  it("uses HMAC-SHA256 rather than storing the visitor UUID", () => {
    const secret = "s".repeat(32);
    const expected = createHmac("sha256", secret).update(visitorId).digest("hex");
    expect(hashVisitorId(visitorId, secret)).toBe(expected);
    expect(hashVisitorId(visitorId, secret)).not.toContain(visitorId);
  });

  it("keeps a cookie-less bootstrap retry on the same anonymous visitor", () => {
    process.env.VISITOR_HASH_SECRET = "s".repeat(32);
    const bootstrapId = "123e4567-e89b-42d3-a456-426614174099";
    const first = getVisitorIdentity(new NextRequest("https://clickme.example/"), bootstrapId);
    const retry = getVisitorIdentity(new NextRequest("https://clickme.example/"), bootstrapId);
    const otherNavigation = getVisitorIdentity(
      new NextRequest("https://clickme.example/"),
      "123e4567-e89b-42d3-a456-426614174098",
    );

    expect(retry.id).toBe(first.id);
    expect(retry.hash).toBe(first.hash);
    expect(otherNavigation.id).not.toBe(first.id);
  });

  it("prefers Cloudflare's client address over proxy forwarding headers", () => {
    const request = new Request("https://clickme.madcamp-kaist.org/api/vote", {
      headers: {
        "cf-connecting-ip": "203.0.113.9",
        "x-real-ip": "198.51.100.7",
        "x-forwarded-for": "192.0.2.1, 198.51.100.8",
      },
    });

    expect(getClientAddress(request)).toBe("203.0.113.9");
  });

  it("uses the first forwarded address when Cloudflare headers are unavailable", () => {
    const request = new Request("http://127.0.0.1/api/vote", {
      headers: { "x-forwarded-for": "203.0.113.3, 198.51.100.8" },
    });

    expect(getClientAddress(request)).toBe("203.0.113.3");
  });
});

describe("daily session and share tokens", () => {
  const visitorId = "123e4567-e89b-42d3-a456-426614174000";
  const sessionId = "123e4567-e89b-42d3-a456-426614174001";

  it("signs session and CSRF values without exposing the secret", () => {
    process.env.VISITOR_HASH_SECRET = "s".repeat(32);
    const cookie = createSessionCookieValue(sessionId, visitorId);
    expect(cookie.startsWith(`${sessionId}.`)).toBe(true);
    expect(csrfToken(sessionId, visitorId)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie).not.toContain("s".repeat(32));
  });

  it("derives a stable 128-bit opaque share token per idempotency key", () => {
    process.env.VISITOR_HASH_SECRET = "s".repeat(32);
    const key = "123e4567-e89b-42d3-a456-426614174002";
    const token = createShareToken("a".repeat(64), key);
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(createShareToken("a".repeat(64), key)).toBe(token);
    expect(hashShareToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("requires a short-lived signed server receipt and permits safe network retries", () => {
    process.env.VISITOR_HASH_SECRET = "s".repeat(32);
    const now = 1_800_000_000_000;
    const token = "abcdefghijklmnopqrstuv";
    const otherToken = "zyxwvutsrqponmlkjihgfe";
    const receipt = createReferralReceipt(token, now);

    expect(receipt).not.toContain(token);
    expect(verifyReferralReceipt(receipt, otherToken, now + 1)).toBe(false);
    expect(verifyReferralReceipt(receipt, token, now + 1)).toBe(true);
    expect(verifyReferralReceipt(receipt, token, now + 2)).toBe(true);
    expect(verifyReferralReceipt(receipt, token, now + 10 * 60 * 1_000 + 1)).toBe(false);
  });
});

describe("vote result formatting", () => {
  it("returns integer percentages that add to 100", () => {
    expect(formatVoteResults({
      dip_count: 1,
      pour_count: 2,
      total_count: 3,
      campaign_id: "123e4567-e89b-42d3-a456-426614174000",
      campaign_status: "active",
      starts_at: "2026-01-01T00:00:00.000Z",
      ends_at: "2027-01-01T00:00:00.000Z",
      revision: 1,
    })).toEqual({
      counts: { dip: 1, pour: 2, total: 3 },
      percentages: { dip: 33, pour: 67 },
      campaign: {
        id: "123e4567-e89b-42d3-a456-426614174000",
        status: "active",
        startsAt: "2026-01-01T00:00:00.000Z",
        endsAt: "2027-01-01T00:00:00.000Z",
        revision: 1,
      },
    });
  });

  it("returns zero percentages when there are no votes", () => {
    expect(formatVoteResults({
      dip_count: 0,
      pour_count: 0,
      total_count: 0,
      campaign_id: "123e4567-e89b-42d3-a456-426614174000",
      campaign_status: "active",
      starts_at: "2026-01-01T00:00:00.000Z",
      ends_at: "2027-01-01T00:00:00.000Z",
      revision: 1,
    }).percentages).toEqual({ dip: 0, pour: 0 });
  });
});
