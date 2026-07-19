import type { NextRequest } from "next/server";

import { hasValidAdminSession } from "../../../../lib/server/admin-auth";
import { apiError, jsonNoStore, readBoundedJsonObject, rejectUnsafeMutation } from "../../../../lib/server/http";
import { getSupabaseAdmin } from "../../../../lib/server/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CAMPAIGN_MODES = ["active", "protected", "read_only"] as const;
type CampaignModeValue = (typeof CAMPAIGN_MODES)[number];

function isCampaignMode(value: unknown): value is CampaignModeValue {
  return typeof value === "string" && (CAMPAIGN_MODES as readonly string[]).includes(value);
}

function isIsoTimestampOrNull(value: unknown): value is string | null {
  if (value === null) return true;
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export async function POST(request: NextRequest) {
  const unsafeRequest = rejectUnsafeMutation(request);
  if (unsafeRequest) return unsafeRequest;
  if (!hasValidAdminSession(request)) {
    return apiError(401, "관리자 세션이 필요합니다.", "ADMIN_SESSION_REQUIRED");
  }

  const body = await readBoundedJsonObject(request, 2_048);
  if (!body.ok) return apiError(400, "요청 형식이 올바르지 않습니다.", "INVALID_REQUEST");

  const { startsAt, endsAt, mode, reason } = body.value;
  if (
    !isIsoTimestampOrNull(startsAt)
    || !isIsoTimestampOrNull(endsAt)
    || !isCampaignMode(mode)
    || typeof reason !== "string"
    || reason.trim().length < 1
    || reason.trim().length > 500
  ) {
    return apiError(400, "요청 형식이 올바르지 않습니다.", "INVALID_REQUEST");
  }

  const { data, error } = await getSupabaseAdmin()
    .rpc("set_campaign_window", {
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_mode: mode,
      p_reason: reason,
    })
    .abortSignal(AbortSignal.timeout(3_000))
    .single();

  if (error?.message.includes("invalid_campaign_window")) {
    return apiError(400, "시작 시각은 종료 시각보다 빨라야 합니다.", "INVALID_CAMPAIGN_WINDOW");
  }
  if (error || !data) return apiError(503, "캠페인 설정을 변경할 수 없습니다.", "SERVICE_UNAVAILABLE");

  return jsonNoStore({ campaign: data });
}
