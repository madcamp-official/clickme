import type { NextRequest } from "next/server";

import { hasValidAdminSession } from "../../../../lib/server/admin-auth";
import { isChoice } from "../../../../lib/server/contracts";
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

  const { title, optionALabel, optionAChoice, optionBLabel, optionBChoice, reason } = body.value;
  if (
    !isNonEmptyString(title, 200)
    || !isNonEmptyString(optionALabel, 60)
    || !isNonEmptyString(optionBLabel, 60)
    || !isChoice(optionAChoice)
    || !isChoice(optionBChoice)
    || optionAChoice === optionBChoice
    || !isNonEmptyString(reason, 500)
  ) {
    return apiError(400, "요청 형식이 올바르지 않습니다.", "INVALID_REQUEST");
  }

  const { data, error } = await getSupabaseAdmin()
    .rpc("archive_current_topic_and_reset", {
      p_title: title,
      p_option_a_label: optionALabel,
      p_option_a_choice: optionAChoice,
      p_option_b_label: optionBLabel,
      p_option_b_choice: optionBChoice,
      p_reason: reason,
    })
    .abortSignal(AbortSignal.timeout(3_000))
    .single();

  if (error || !data) return apiError(503, "주제를 아카이브할 수 없습니다.", "SERVICE_UNAVAILABLE");

  return jsonNoStore({ topic: data });
}
