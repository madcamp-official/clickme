import { rateLimit } from "express-rate-limit";

const handler = (
  _req: unknown,
  res: { status: (code: number) => { json: (body: unknown) => void } }
) =>
  res
    .status(429)
    .json({ success: false, error: { code: "FORBIDDEN", message: "요청이 너무 많습니다." } });

export const apiRateLimit = rateLimit({ windowMs: 15 * 60_000, limit: 300, handler });
export const oauthRateLimit = rateLimit({ windowMs: 15 * 60_000, limit: 30, handler });
export const refreshRateLimit = rateLimit({ windowMs: 15 * 60_000, limit: 30, handler });
export const reportRateLimit = rateLimit({ windowMs: 60 * 60_000, limit: 10, handler });
export const adminMutationRateLimit = rateLimit({ windowMs: 15 * 60_000, limit: 60, handler });
