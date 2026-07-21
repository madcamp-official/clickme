import { CRITICAL_DATABASE_RESERVE, teamTopicHistoryCapacity, tryAcquireDatabase } from "../../../../lib/server/capacity";
import { apiError, jsonPublicResult } from "../../../../lib/server/http";
import { getSupabaseAdmin } from "../../../../lib/server/supabase";
import { formatTeamTopicHistory } from "../../../../lib/server/team-topics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const release = tryAcquireDatabase(teamTopicHistoryCapacity, CRITICAL_DATABASE_RESERVE);
  if (!release) {
    return apiError(503, "이전 주제를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.", "CAPACITY_EXCEEDED", { "Retry-After": "1" });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .rpc("list_public_team_topic_history", { p_limit: 10 })
      .abortSignal(AbortSignal.timeout(2_000));

    if (error || !data) {
      return apiError(503, "이전 주제를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.", "SERVICE_UNAVAILABLE");
    }

    return jsonPublicResult(formatTeamTopicHistory(data));
  } catch {
    return apiError(503, "이전 주제를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.", "SERVICE_UNAVAILABLE");
  } finally {
    release();
  }
}
