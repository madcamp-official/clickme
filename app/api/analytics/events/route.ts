import type { NextRequest } from "next/server";

import { validateEvents } from "../../../../lib/server/analytics-validation";
import { CRITICAL_DATABASE_RESERVE, telemetryCapacity, tryAcquireDatabase } from "../../../../lib/server/capacity";
import { apiError, jsonNoStore, readBoundedJsonObject, rejectUnsafeMutation } from "../../../../lib/server/http";
import { hasValidCsrf, isUuid, readSessionId } from "../../../../lib/server/session-cookie";
import { getSupabaseAdmin } from "../../../../lib/server/supabase";
import { getVisitorIdentity } from "../../../../lib/server/visitor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const unsafeRequest = rejectUnsafeMutation(request);
  if (unsafeRequest) return unsafeRequest;
  const body = await readBoundedJsonObject(request, 16_384);
  if (!body.ok) return apiError(body.reason === "too_large" ? 413 : 400, "이벤트 형식이 올바르지 않습니다.", body.reason === "too_large" ? "PAYLOAD_TOO_LARGE" : "INVALID_EVENTS");
  const { sessionId, pageViewId } = body.value;
  if (!isUuid(sessionId) || !isUuid(pageViewId)) return apiError(400, "이벤트 형식이 올바르지 않습니다.", "INVALID_EVENTS");
  const events = validateEvents(body.value.events, pageViewId, isUuid);
  if (!events) return apiError(400, "이벤트 형식이 올바르지 않습니다.", "INVALID_EVENTS");

  const visitor = getVisitorIdentity(request);
  if (readSessionId(request, visitor) !== sessionId || !hasValidCsrf(request, sessionId, visitor.id)) {
    return apiError(409, "오늘의 세션이 만료되었습니다.", "SESSION_EXPIRED");
  }
  const release = tryAcquireDatabase(telemetryCapacity, CRITICAL_DATABASE_RESERVE);
  if (!release) return apiError(503, "분석 요청을 처리할 수 없습니다.", "CAPACITY_EXCEEDED", { "Retry-After": "1" });

  try {
    const { error } = await getSupabaseAdmin()
      .rpc("record_analytics_events", {
        p_visitor_hash: visitor.hash,
        p_session_id: sessionId,
        p_events: events,
      })
      .abortSignal(AbortSignal.timeout(3_000));
    if (error?.message.includes("session_expired") || error?.message.includes("invalid_session")) {
      return apiError(409, "오늘의 세션이 만료되었습니다.", "SESSION_EXPIRED");
    }
    if (error?.message.includes("analytics_disabled")) return jsonNoStore({ accepted: false, disabled: true }, { status: 202 });
    if (error?.message.includes("analytics_rate_limited")) return apiError(429, "분석 요청이 너무 많습니다.", "RATE_LIMITED", { "Retry-After": "10" });
    if (error) return apiError(503, "분석 요청을 처리할 수 없습니다.", "SERVICE_UNAVAILABLE");
    return jsonNoStore({ accepted: true });
  } catch {
    return apiError(503, "분석 요청을 처리할 수 없습니다.", "SERVICE_UNAVAILABLE");
  } finally {
    release();
  }
}
