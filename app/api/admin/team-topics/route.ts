import type { NextRequest } from "next/server";

import { hasValidAdminSession } from "../../../../lib/server/admin-auth";
import { TEAM_CHOICES } from "../../../../lib/server/contracts";
import { apiError, jsonNoStore, readBoundedJsonObject, rejectUnsafeMutation } from "../../../../lib/server/http";
import { getSupabaseAdmin } from "../../../../lib/server/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= maxLength;
}

export async function POST(request: NextRequest) {
  const unsafeRequest = rejectUnsafeMutation(request);
  if (unsafeRequest) return unsafeRequest;
  if (!hasValidAdminSession(request)) {
    return apiError(401, "관리자 세션이 필요합니다.", "ADMIN_SESSION_REQUIRED");
  }

  const body = await readBoundedJsonObject(request, 2_048);
  if (!body.ok) return apiError(400, "요청 형식이 올바르지 않습니다.", "INVALID_REQUEST");

  const { title, reason, labels } = body.value;
  if (
    !isNonEmptyString(title, 200)
    || !isNonEmptyString(reason, 500)
    || !labels
    || typeof labels !== "object"
    || Array.isArray(labels)
  ) {
    return apiError(400, "요청 형식이 올바르지 않습니다.", "INVALID_REQUEST");
  }

  const rawLabels = labels as Record<string, unknown>;
  const validatedLabels: Record<string, string> = {};
  for (const choice of TEAM_CHOICES) {
    const label = rawLabels[choice];
    if (!isNonEmptyString(label, 60)) {
      return apiError(400, "모든 팀의 라벨을 입력해 주세요.", "INVALID_REQUEST");
    }
    validatedLabels[choice] = label;
  }

  const { data, error } = await getSupabaseAdmin()
    .rpc("archive_current_team_topic_and_reset", {
      p_title: title,
      p_reason: reason,
      p_labels: validatedLabels,
    })
    .abortSignal(AbortSignal.timeout(3_000))
    .single();

  if (error || !data) return apiError(503, "팀 주제를 아카이브할 수 없습니다.", "SERVICE_UNAVAILABLE");

  return jsonNoStore({ topic: data });
}
