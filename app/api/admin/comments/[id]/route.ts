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

  const supabase = getSupabaseAdmin();
  const binaryDelete = await supabase
    .from("comments")
    .delete()
    .eq("id", id)
    .select("id")
    .abortSignal(AbortSignal.timeout(3_000));

  if (binaryDelete.error) return apiError(503, "댓글을 삭제할 수 없습니다.", "SERVICE_UNAVAILABLE");
  if (binaryDelete.data.length > 0) return jsonNoStore({ ok: true });

  // team_comments is a fully separate table from comments (20260721000000);
  // an id that doesn't match a binary comment might still be a team one.
  const teamDelete = await supabase
    .from("team_comments")
    .delete()
    .eq("id", id)
    .select("id")
    .abortSignal(AbortSignal.timeout(3_000));

  if (teamDelete.error) return apiError(503, "댓글을 삭제할 수 없습니다.", "SERVICE_UNAVAILABLE");
  return jsonNoStore({ ok: true });
}
