import { apiError } from "../../../lib/server/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function disabled() {
  return apiError(410, "댓글 기능은 현재 제공하지 않습니다.", "COMMENTS_DISABLED");
}

export const GET = disabled;
export const POST = disabled;
