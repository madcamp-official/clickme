import { CRITICAL_DATABASE_RESERVE, topicHistoryCapacity, tryAcquireDatabase } from "../../../../lib/server/capacity";
import { apiError, jsonPublicResult } from "../../../../lib/server/http";
import { getSupabaseAdmin } from "../../../../lib/server/supabase";
import { formatTopicHistory } from "../../../../lib/server/topics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const release = tryAcquireDatabase(topicHistoryCapacity, CRITICAL_DATABASE_RESERVE);
  if (!release) {
    return apiError(503, "이전 주제를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.", "CAPACITY_EXCEEDED", { "Retry-After": "1" });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .rpc("list_public_topic_history", { p_limit: 10 })
      .abortSignal(AbortSignal.timeout(2_000));

    if (error || !data) {
      return apiError(503, "이전 주제를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.", "SERVICE_UNAVAILABLE");
    }

    return jsonPublicResult(formatTopicHistory(data));
  } catch {
    return apiError(503, "이전 주제를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.", "SERVICE_UNAVAILABLE");
  } finally {
    release();
  }
}
