import { NextResponse } from "next/server";

import type { ApiError } from "./contracts";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

const PUBLIC_RESULT_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=1, stale-while-revalidate=5",
} as const;

export type JsonReadResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; reason: "invalid" | "too_large" };

export function jsonNoStore<T>(
  body: T,
  init?: { status?: number; headers?: HeadersInit },
): NextResponse<T> {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(NO_STORE_HEADERS)) {
    headers.set(key, value);
  }

  return NextResponse.json(body, {
    status: init?.status,
    headers,
  });
}

export function apiError(
  status: number,
  error: string,
  code?: string,
  headers?: HeadersInit,
): NextResponse<ApiError> {
  return jsonNoStore(
    { error, ...(code ? { code } : {}) },
    { status, headers },
  );
}

export function jsonPublicResult<T>(body: T): NextResponse<T> {
  return NextResponse.json(body, { headers: PUBLIC_RESULT_CACHE_HEADERS });
}

export function rejectUnsafeMutation(request: Request): NextResponse<ApiError> | null {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return apiError(415, "JSON 요청만 허용됩니다.", "UNSUPPORTED_MEDIA_TYPE");
  }

  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return apiError(403, "교차 출처 요청은 허용되지 않습니다.", "CROSS_SITE_REQUEST");
  }
  if (process.env.NODE_ENV === "production" && fetchSite !== "same-origin") {
    return apiError(403, "브라우저 요청 정보를 확인할 수 없습니다.", "INVALID_FETCH_METADATA");
  }

  const origin = request.headers.get("origin")?.trim();
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (process.env.NODE_ENV === "production" && !configuredSiteUrl) {
    return apiError(503, "서버 요청 출처 설정을 확인할 수 없습니다.", "CONFIGURATION_ERROR");
  }
  let allowedOrigin: string;
  try {
    allowedOrigin = configuredSiteUrl
      ? new URL(configuredSiteUrl).origin
      : new URL(request.url).origin;
  } catch {
    return apiError(403, "요청 출처를 확인할 수 없습니다.", "INVALID_ORIGIN");
  }

  if (!origin || origin !== allowedOrigin) {
    return apiError(403, "교차 출처 요청은 허용되지 않습니다.", "CROSS_SITE_REQUEST");
  }

  return null;
}

export async function readBoundedJsonObject(
  request: Request,
  maxBytes: number,
): Promise<JsonReadResult> {
  const contentLengthValue = request.headers.get("content-length");
  if (contentLengthValue) {
    const contentLength = Number(contentLengthValue);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      return { ok: false, reason: "invalid" };
    }
    if (contentLength > maxBytes) {
      return { ok: false, reason: "too_large" };
    }
  }

  if (!request.body) {
    return { ok: false, reason: "invalid" };
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let totalBytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("request body too large");
        return { ok: false, reason: "too_large" };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch {
    return { ok: false, reason: "invalid" };
  }

  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? { ok: true, value: value as Record<string, unknown> }
      : { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const result = await readBoundedJsonObject(request, 2_048);
  return result.ok ? result.value : null;
}
