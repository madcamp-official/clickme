import type { NextRequest } from "next/server";

import {
  classifyReferrerHost,
  classifyClient,
  classifyTimeZone,
  classifyUtmMedium,
  classifyUtmSource,
  dimensionBucket,
  hashReferralToken,
  normalizeLanguage,
  normalizePath,
  normalizeReferralToken,
  opaqueAnalyticsLabel,
} from "../../../lib/server/analytics-validation";
import { sessionCapacity, tryAcquireDatabase } from "../../../lib/server/capacity";
import { getSiteUrl, getVisitorHashSecret } from "../../../lib/server/env";
import { apiError, jsonNoStore, readBoundedJsonObject, rejectUnsafeMutation } from "../../../lib/server/http";
import { verifyReferralReceipt } from "../../../lib/server/referral-receipt";
import { csrfToken, isUuid, setSessionCookie } from "../../../lib/server/session-cookie";
import { getSupabaseAdmin } from "../../../lib/server/supabase";
import { getNetworkIdentityHash, getVisitorIdentity, setVisitorCookie } from "../../../lib/server/visitor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function POST(request: NextRequest) {
  const unsafeRequest = rejectUnsafeMutation(request);
  if (unsafeRequest) return unsafeRequest;

  const body = await readBoundedJsonObject(request, 4_096);
  if (!body.ok) {
    return apiError(
      body.reason === "too_large" ? 413 : 400,
      body.reason === "too_large" ? "요청 본문이 너무 큽니다." : "세션 요청 형식이 올바르지 않습니다.",
      body.reason === "too_large" ? "PAYLOAD_TOO_LARGE" : "INVALID_SESSION_REQUEST",
    );
  }

  const path = normalizePath(body.value.path);
  const requestedPageViewId = body.value.pageViewId;
  const referralTokenValue = body.value.referralToken;
  const referralToken = referralTokenValue === undefined || referralTokenValue === null
    ? null
    : normalizeReferralToken(referralTokenValue);
  const isReferralLanding = path === "/r/:token";
  const referralReceiptValue = body.value.referralReceipt;
  const hasReferralTokenField = referralTokenValue !== undefined && referralTokenValue !== null;
  const hasReferralReceiptField = referralReceiptValue !== undefined && referralReceiptValue !== null;
  if (
    !path
    || !isUuid(requestedPageViewId)
    || hasReferralTokenField !== hasReferralReceiptField
    || (hasReferralTokenField && (!isReferralLanding || !referralToken))
    || (hasReferralReceiptField && typeof referralReceiptValue !== "string")
  ) {
    return apiError(400, "세션 요청 형식이 올바르지 않습니다.", "INVALID_SESSION_REQUEST");
  }
  if (referralToken && !verifyReferralReceipt(referralReceiptValue, referralToken)) {
    return apiError(400, "추천 방문 확인 정보가 유효하지 않습니다.", "INVALID_REFERRAL_RECEIPT");
  }

  const utm = object(body.value.utm);
  const client = object(body.value.client);
  const visitor = getVisitorIdentity(request, requestedPageViewId);
  const release = tryAcquireDatabase(sessionCapacity);
  if (!release) {
    const response = apiError(503, "요청이 많아 세션을 시작할 수 없습니다.", "CAPACITY_EXCEEDED", { "Retry-After": "1" });
    setVisitorCookie(response, visitor);
    return response;
  }

  try {
    const pageViewId = requestedPageViewId;
    const classified = classifyClient(request.headers.get("user-agent"));
    const analyticsSecret = getVisitorHashSecret();
    const ownHost = new URL(getSiteUrl()).hostname;
    const countryHeader = request.headers.get("cf-ipcountry")?.trim().toUpperCase();
    const countryCode = countryHeader && /^[A-Z]{2}$/.test(countryHeader) ? countryHeader : null;
    const { data, error } = await getSupabaseAdmin()
      .rpc("bootstrap_daily_session", {
        p_visitor_hash: visitor.hash,
        p_network_hash: getNetworkIdentityHash(request),
        p_page_view_id: pageViewId,
        p_landing_path: path,
        p_referrer_host: classifyReferrerHost(body.value.referrerHost, ownHost),
        p_utm_source: classifyUtmSource(utm.source),
        p_utm_medium: classifyUtmMedium(utm.medium),
        p_utm_campaign: opaqueAnalyticsLabel(utm.campaign, "campaign", analyticsSecret),
        p_utm_content: opaqueAnalyticsLabel(utm.content, "content", analyticsSecret),
        p_utm_term: opaqueAnalyticsLabel(utm.term, "term", analyticsSecret),
        p_country_code: countryCode,
        p_browser_family: classified.browserFamily,
        p_os_family: classified.osFamily,
        p_device_type: classified.deviceType,
        p_language: normalizeLanguage(client.language),
        p_timezone: classifyTimeZone(client.timeZone),
        p_viewport_width: dimensionBucket(client.viewportWidth),
        p_viewport_height: dimensionBucket(client.viewportHeight),
        p_screen_width: dimensionBucket(client.screenWidth),
        p_screen_height: dimensionBucket(client.screenHeight),
        p_touch: typeof client.touch === "boolean" ? client.touch : null,
        p_reduced_motion: typeof client.reducedMotion === "boolean" ? client.reducedMotion : null,
        p_referral_token_hash: referralToken ? hashReferralToken(referralToken) : null,
      })
      .abortSignal(AbortSignal.timeout(3_000))
      .single();

    if (error?.message.includes("session_rate_limited")) {
      return apiError(429, "세션 요청이 너무 많습니다.", "RATE_LIMITED", { "Retry-After": "60" });
    }
    if (error?.message.includes("campaign_not_active") || error?.message.includes("campaign_ended")) {
      return apiError(410, "현재 참여가 종료되었습니다.", "CAMPAIGN_ENDED");
    }
    if (error || !data) {
      return apiError(503, "세션을 시작할 수 없습니다.", "SERVICE_UNAVAILABLE");
    }

    const serverTimeMs = Date.parse(data.server_time);
    const expiresAtMs = Date.parse(data.expires_at);
    const expiresInMs = Math.floor(expiresAtMs - serverTimeMs);
    if (
      !Number.isFinite(serverTimeMs)
      || !Number.isFinite(expiresAtMs)
      || expiresInMs <= 0
      || expiresInMs > 90_000_000
    ) {
      return apiError(503, "세션 만료 시각을 확인할 수 없습니다.", "SERVICE_UNAVAILABLE");
    }

    const response = jsonNoStore({
      sessionId: data.session_id,
      pageViewId: data.page_view_id,
      expiresAt: data.expires_at,
      serverTime: data.server_time,
      expiresInMs,
      csrfToken: csrfToken(data.session_id, visitor.id),
      heartbeatIntervalMs: 15_000,
      campaign: {
        id: data.campaign_id,
        status: data.campaign_status,
        startsAt: data.starts_at,
        endsAt: data.ends_at,
        revision: data.revision,
      },
      experimentVariant: data.experiment_variant,
    });
    setVisitorCookie(response, visitor);
    setSessionCookie(response, data.session_id, data.expires_at, data.server_time, visitor);
    return response;
  } catch {
    const response = apiError(503, "세션을 시작할 수 없습니다.", "SERVICE_UNAVAILABLE");
    setVisitorCookie(response, visitor);
    return response;
  } finally {
    release();
  }
}
