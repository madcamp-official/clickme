import type { NextRequest } from "next/server";

import { clearAdminSessionCookie } from "../../../../lib/server/admin-auth";
import { jsonNoStore, rejectUnsafeMutation } from "../../../../lib/server/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const unsafeRequest = rejectUnsafeMutation(request);
  if (unsafeRequest) return unsafeRequest;

  const response = jsonNoStore({ ok: true });
  clearAdminSessionCookie(response);
  return response;
}
