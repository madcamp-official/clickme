import type { NextRequest } from "next/server";

import {
  CRITICAL_DATABASE_RESERVE,
  commentCapacity,
  commentReadCapacity,
  tryAcquireDatabase,
} from "../../../lib/server/capacity";
import { isCommentBodyAllowed } from "../../../lib/server/comment-filter";
import { formatComments } from "../../../lib/server/comments";
import { isChoice } from "../../../lib/server/contracts";
import { apiError, jsonNoStore, jsonPublicResult, readBoundedJsonObject, rejectUnsafeMutation } from "../../../lib/server/http";
import { hasValidCsrf, isUuid, readSessionId } from "../../../lib/server/session-cookie";
import { getSupabaseAdmin } from "../../../lib/server/supabase";
import { getNetworkIdentityHash, getVisitorIdentity, setVisitorCookie } from "../../../lib/server/visitor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const release = tryAcquireDatabase(commentReadCapacity, CRITICAL_DATABASE_RESERVE);
  if (!release) {
    return apiError(503, "댓글을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.", "CAPACITY_EXCEEDED", { "Retry-After": "1" });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .rpc("list_public_comments", { p_limit: 50 })
      .abortSignal(AbortSignal.timeout(2_000));

    if (error || !data) {
      return apiError(503, "댓글을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.", "SERVICE_UNAVAILABLE");
    }

    return jsonPublicResult(formatComments(data));
  } catch {
    return apiError(503, "댓글을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.", "SERVICE_UNAVAILABLE");
  } finally {
    release();
  }
}

export async function POST(request: NextRequest) {
  const unsafeRequest = rejectUnsafeMutation(request);
  if (unsafeRequest) return unsafeRequest;

  const body = await readBoundedJsonObject(request, 4_096);
  if (!body.ok) {
    return apiError(
      body.reason === "too_large" ? 413 : 400,
      body.reason === "too_large" ? "요청 본문이 너무 큽니다." : "댓글 요청 형식이 올바르지 않습니다.",
      body.reason === "too_large" ? "PAYLOAD_TOO_LARGE" : "INVALID_COMMENT",
    );
  }

  const { choice, requestId, sessionId, pageViewId, body: commentBody } = body.value;
  if (
    !isChoice(choice)
    || !isUuid(requestId)
    || !isUuid(sessionId)
    || !isUuid(pageViewId)
    || typeof commentBody !== "string"
    || commentBody.trim().length === 0
    || commentBody.length > 240
  ) {
    return apiError(400, "댓글 요청 형식이 올바르지 않습니다.", "INVALID_COMMENT");
  }

  if (!isCommentBodyAllowed(commentBody)) {
    return apiError(400, "댓글 내용을 확인해 주세요.", "COMMENT_REJECTED");
  }

  const visitor = getVisitorIdentity(request);
  const cookieSessionId = readSessionId(request, visitor);
  if (cookieSessionId !== sessionId || !hasValidCsrf(request, sessionId, visitor.id)) {
    const response = apiError(409, "오늘의 세션을 다시 시작해 주세요.", "SESSION_EXPIRED");
    setVisitorCookie(response, visitor);
    return response;
  }

  const release = tryAcquireDatabase(commentCapacity, CRITICAL_DATABASE_RESERVE);
  if (!release) {
    return apiError(503, "요청이 많아 잠시 처리할 수 없습니다.", "CAPACITY_EXCEEDED", { "Retry-After": "1" });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .rpc("submit_comment", {
        p_visitor_hash: visitor.hash,
        p_network_hash: getNetworkIdentityHash(request),
        p_session_id: sessionId,
        p_page_view_id: pageViewId,
        p_request_id: requestId,
        p_choice: choice,
        p_body: commentBody.trim(),
      })
      .abortSignal(AbortSignal.timeout(3_000))
      .single();

    if (error?.message.includes("rate_limited")) {
      return apiError(429, "댓글을 너무 자주 작성했습니다. 잠시 후 다시 시도해 주세요.", "RATE_LIMITED", { "Retry-After": "60" });
    }
    if (error?.message.includes("vote_required")) {
      return apiError(403, "투표 후 댓글을 남길 수 있습니다.", "VOTE_REQUIRED");
    }
    if (error?.message.includes("session_expired") || error?.message.includes("invalid_session")) {
      return apiError(409, "오늘의 세션을 다시 시작해 주세요.", "SESSION_EXPIRED");
    }
    if (error?.message.includes("campaign_not_active")) {
      return apiError(410, "지금은 댓글을 작성할 수 없습니다.", "COMMENTS_DISABLED");
    }
    if (error?.message.includes("invalid_comment_body") || error?.message.includes("invalid_page_view") || error?.message.includes("invalid_comment_request")) {
      return apiError(400, "댓글 요청 형식이 올바르지 않습니다.", "INVALID_COMMENT");
    }
    if (error || !data) {
      return apiError(503, "댓글을 남길 수 없습니다. 잠시 후 다시 시도해 주세요.", "SERVICE_UNAVAILABLE");
    }

    return jsonNoStore({ accepted: true, commentId: data.comment_id, duplicate: data.duplicate });
  } catch {
    return apiError(503, "댓글을 남길 수 없습니다. 잠시 후 다시 시도해 주세요.", "SERVICE_UNAVAILABLE");
  } finally {
    release();
  }
}
