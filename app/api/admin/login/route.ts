import type { NextRequest } from "next/server";

import {
  clearLoginFailures,
  isLoginRateLimited,
  recordLoginFailure,
  setAdminSessionCookie,
  verifyAdminPassword,
} from "../../../../lib/server/admin-auth";
import { apiError, jsonNoStore, readBoundedJsonObject, rejectUnsafeMutation } from "../../../../lib/server/http";
import { getNetworkIdentityHash } from "../../../../lib/server/visitor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const unsafeRequest = rejectUnsafeMutation(request);
  if (unsafeRequest) return unsafeRequest;

  const networkHash = getNetworkIdentityHash(request);
  if (isLoginRateLimited(networkHash)) {
    return apiError(429, "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.", "RATE_LIMITED", { "Retry-After": "60" });
  }

  const body = await readBoundedJsonObject(request, 1_024);
  const password = body.ok ? body.value.password : null;
  if (typeof password !== "string" || password.length === 0 || password.length > 512) {
    recordLoginFailure(networkHash);
    return apiError(400, "비밀번호 형식이 올바르지 않습니다.", "INVALID_PASSWORD");
  }

  if (!verifyAdminPassword(password)) {
    recordLoginFailure(networkHash);
    return apiError(401, "비밀번호가 올바르지 않습니다.", "INVALID_CREDENTIALS");
  }

  clearLoginFailures(networkHash);
  const response = jsonNoStore({ ok: true });
  setAdminSessionCookie(response);
  return response;
}
