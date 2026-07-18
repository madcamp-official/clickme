import type { NextRequest } from "next/server";

import {
  CRITICAL_DATABASE_RESERVE,
  shareCreateCapacity,
  tryAcquireDatabase,
} from "../../../lib/server/capacity";
import { isChoice } from "../../../lib/server/contracts";
import { apiError, jsonNoStore, readBoundedJsonObject, rejectUnsafeMutation } from "../../../lib/server/http";
import { hasValidCsrf, isUuid, readSessionId } from "../../../lib/server/session-cookie";
import {
  createShareToken,
  hashShareToken,
  renderShareCard,
  shareImageUrl,
  shareUrl,
  storeShareCard,
} from "../../../lib/server/shares";
import { getSupabaseAdmin } from "../../../lib/server/supabase";
import { getVisitorIdentity } from "../../../lib/server/visitor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const unsafeRequest = rejectUnsafeMutation(request);
  if (unsafeRequest) return unsafeRequest;
  const body = await readBoundedJsonObject(request, 4_096);
  if (!body.ok) return apiError(body.reason === "too_large" ? 413 : 400, "공유 요청 형식이 올바르지 않습니다.", body.reason === "too_large" ? "PAYLOAD_TOO_LARGE" : "INVALID_SHARE");

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  const { sessionId, pageViewId, choice } = body.value;
  if (!isUuid(idempotencyKey) || !isUuid(sessionId) || !isUuid(pageViewId) || !isChoice(choice)) {
    return apiError(400, "공유 요청 형식이 올바르지 않습니다.", "INVALID_SHARE");
  }
  if (Object.hasOwn(body.value, "parentToken")) {
    return apiError(400, "상위 추천 정보는 세션에서만 결정됩니다.", "INVALID_SHARE");
  }

  const visitor = getVisitorIdentity(request);
  if (readSessionId(request, visitor) !== sessionId || !hasValidCsrf(request, sessionId, visitor.id)) {
    return apiError(409, "오늘의 세션이 만료되었습니다.", "SESSION_EXPIRED");
  }
  const releaseCreate = shareCreateCapacity.tryAcquire();
  if (!releaseCreate) return apiError(503, "공유 링크를 만들 수 없습니다.", "CAPACITY_EXCEEDED", { "Retry-After": "1" });

  try {
    const token = createShareToken(visitor.hash, idempotencyKey);
    const releaseDatabase = tryAcquireDatabase(undefined, CRITICAL_DATABASE_RESERVE);
    if (!releaseDatabase) return apiError(503, "공유 링크를 만들 수 없습니다.", "CAPACITY_EXCEEDED", { "Retry-After": "1" });
    const result = await (async () => {
      try {
        return await getSupabaseAdmin()
          .rpc("create_share_link", {
            p_visitor_hash: visitor.hash,
            p_session_id: sessionId,
            p_page_view_id: pageViewId,
            p_idempotency_key: idempotencyKey,
            p_token_hash: hashShareToken(token),
            p_choice: choice,
            p_parent_token_hash: null,
          })
          .abortSignal(AbortSignal.timeout(3_000))
          .single();
      } finally {
        releaseDatabase();
      }
    })();
    const { data, error } = result;

    if (error?.message.includes("session_expired") || error?.message.includes("invalid_session")) return apiError(409, "오늘의 세션이 만료되었습니다.", "SESSION_EXPIRED");
    if (error?.message.includes("share_rate_limited")) return apiError(429, "공유 링크를 너무 자주 만들었습니다.", "RATE_LIMITED", { "Retry-After": "60" });
    if (error?.message.includes("vote_required")) return apiError(403, "투표 후 공유할 수 있습니다.", "VOTE_REQUIRED");
    if (error?.message.includes("sharing_disabled") || error?.message.includes("share_creation_disabled") || error?.message.includes("campaign_not_active")) return apiError(410, "현재 추천 링크를 만들 수 없습니다.", "SHARING_DISABLED");
    if (error || !data) return apiError(503, "공유 링크를 만들 수 없습니다.", "SERVICE_UNAVAILABLE");

    let imagePath = data.image_path;
    if (data.created) {
      try {
        const png = await renderShareCard(choice, data.dip_count, data.pour_count);
        imagePath = await storeShareCard(data.campaign_id, data.share_id, png);
      } catch {
        // Link creation still succeeds. We deliberately never render again on
        // image reads, so one link can consume at most one render attempt.
        imagePath = null;
      }
    }

    return jsonNoStore({
      shareId: data.share_id,
      shareUrl: shareUrl(token),
      imageUrl: imagePath ? shareImageUrl(token) : null,
    }, { status: data.created ? 201 : 200 });
  } catch {
    return apiError(503, "공유 링크를 만들 수 없습니다.", "SERVICE_UNAVAILABLE");
  } finally {
    releaseCreate();
  }
}
