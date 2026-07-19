import type { NextRequest } from "next/server";

import { hasValidAdminSession } from "../../../../../lib/server/admin-auth";
import { apiError, jsonNoStore, rejectUnsafeMutation } from "../../../../../lib/server/http";
import { isUuid } from "../../../../../lib/server/session-cookie";
import { getSupabaseAdmin } from "../../../../../lib/server/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const unsafeRequest = rejectUnsafeMutation(request);
  if (unsafeRequest) return unsafeRequest;
  if (!hasValidAdminSession(request)) {
    return apiError(401, "관리자 세션이 필요합니다.", "ADMIN_SESSION_REQUIRED");
  }

  const { id } = await context.params;
  if (!isUuid(id)) return apiError(400, "잘못된 댓글 id입니다.", "INVALID_COMMENT_ID");

  const { error } = await getSupabaseAdmin()
    .from("comments")
    .delete()
    .eq("id", id)
    .abortSignal(AbortSignal.timeout(3_000));

  if (error) return apiError(503, "댓글을 삭제할 수 없습니다.", "SERVICE_UNAVAILABLE");
  return jsonNoStore({ ok: true });
}
