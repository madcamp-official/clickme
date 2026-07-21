import { CRITICAL_DATABASE_RESERVE, tryAcquireDatabase } from "../../../lib/server/capacity";
import { apiError, jsonPublicResult } from "../../../lib/server/http";
import { getSupabaseAdmin } from "../../../lib/server/supabase";
import { formatTeamVoteResults } from "../../../lib/server/team-votes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const release = tryAcquireDatabase(undefined, CRITICAL_DATABASE_RESERVE);
  if (!release) {
    return apiError(503, "결과 요청이 많습니다. 잠시 후 다시 시도해 주세요.", "CAPACITY_EXCEEDED", { "Retry-After": "1" });
  }
  try {
    const { data, error } = await getSupabaseAdmin()
      .rpc("get_public_team_vote_results")
      .abortSignal(AbortSignal.timeout(2_000));

    if (error || !data) {
      return apiError(503, "결과를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.", "SERVICE_UNAVAILABLE");
    }

    return jsonPublicResult(formatTeamVoteResults(data));
  } catch {
    return apiError(503, "결과를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.", "SERVICE_UNAVAILABLE");
  } finally {
    release();
  }
}
