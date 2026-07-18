import { tryAcquireDatabase } from "../../../lib/server/capacity";
import { apiError, jsonNoStore } from "../../../lib/server/http";
import { getSupabaseAdmin } from "../../../lib/server/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  // Readiness may use the critical reserve; otherwise sustained normal work at
  // the 48-slot boundary would make a healthy process restart itself.
  const release = tryAcquireDatabase();
  if (!release) return apiError(503, "준비 상태를 확인할 수 없습니다.", "CAPACITY_EXCEEDED");
  try {
    const { error } = await getSupabaseAdmin()
      .rpc("get_public_vote_results")
      .abortSignal(AbortSignal.timeout(2_000));
    if (error) return apiError(503, "준비 상태를 확인할 수 없습니다.", "DATABASE_UNAVAILABLE");
    return jsonNoStore({ status: "ready", database: "ok", timestamp: new Date().toISOString() });
  } catch {
    return apiError(503, "준비 상태를 확인할 수 없습니다.", "DATABASE_UNAVAILABLE");
  } finally {
    release();
  }
}
