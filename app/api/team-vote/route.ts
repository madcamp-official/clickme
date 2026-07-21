import type { NextRequest } from "next/server";

import { CRITICAL_DATABASE_RESERVE, teamVoteCapacity, tryAcquireDatabase } from "../../../lib/server/capacity";
import { isTeamChoice } from "../../../lib/server/contracts";
import { apiError, jsonNoStore, readBoundedJsonObject, rejectUnsafeMutation } from "../../../lib/server/http";
import { hasValidCsrf, isUuid, readSessionId } from "../../../lib/server/session-cookie";
import { getSupabaseAdmin } from "../../../lib/server/supabase";
import { getNetworkIdentityHash, getVisitorIdentity, setVisitorCookie } from "../../../lib/server/visitor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const unsafeRequest = rejectUnsafeMutation(request);
  if (unsafeRequest) return unsafeRequest;

  const body = await readBoundedJsonObject(request, 4_096);
  if (!body.ok) {
    return apiError(
      body.reason === "too_large" ? 413 : 400,
      body.reason === "too_large" ? "요청 본문이 너무 큽니다." : "투표 요청 형식이 올바르지 않습니다.",
      body.reason === "too_large" ? "PAYLOAD_TOO_LARGE" : "INVALID_VOTE",
    );
  }

  const { choice, requestId, sessionId, pageViewId } = body.value;
  if (!isTeamChoice(choice) || !isUuid(requestId) || !isUuid(sessionId) || !isUuid(pageViewId)) {
    return apiError(400, "투표 요청 형식이 올바르지 않습니다.", "INVALID_VOTE");
  }

  const visitor = getVisitorIdentity(request);
  const cookieSessionId = readSessionId(request, visitor);
  if (cookieSessionId !== sessionId || !hasValidCsrf(request, sessionId, visitor.id)) {
    const response = apiError(409, "오늘의 세션을 다시 시작해 주세요.", "SESSION_EXPIRED");
    setVisitorCookie(response, visitor);
    return response;
  }

  const release = tryAcquireDatabase(teamVoteCapacity, CRITICAL_DATABASE_RESERVE);
  if (!release) {
    return apiError(503, "요청이 많아 잠시 처리할 수 없습니다.", "CAPACITY_EXCEEDED", { "Retry-After": "1" });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .rpc("cast_team_vote", {
        p_visitor_hash: visitor.hash,
        p_network_hash: getNetworkIdentityHash(request),
        p_session_id: sessionId,
        p_page_view_id: pageViewId,
        p_request_id: requestId,
        p_choice: choice,
      })
      .abortSignal(AbortSignal.timeout(3_000))
      .single();

    if (error?.message.includes("network_vote_rate_limited")) {
      return apiError(429, "같은 IP에서는 1초에 15번까지만 투표할 수 있습니다.", "NETWORK_RATE_LIMITED", { "Retry-After": "1" });
    }
    if (error?.message.includes("session_expired") || error?.message.includes("invalid_session")) {
      return apiError(409, "오늘의 세션을 다시 시작해 주세요.", "SESSION_EXPIRED");
    }
    if (error?.message.includes("campaign_not_active") || error?.message.includes("campaign_ended")) {
      return apiError(410, "현재 투표가 종료되었습니다.", "CAMPAIGN_ENDED");
    }
    if (error || !data) {
      return apiError(503, "투표를 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.", "SERVICE_UNAVAILABLE");
    }

    return jsonNoStore({ accepted: true, choice: data.choice, duplicate: data.duplicate });
  } catch {
    return apiError(503, "투표를 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.", "SERVICE_UNAVAILABLE");
  } finally {
    release();
  }
}
