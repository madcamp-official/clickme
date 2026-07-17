import type { CookieOptions } from "express";
import { env } from "./env.js";

export const cookieNames = {
  state: "wm_oauth_state",
  access: "wm_access_token",
  refresh: "wm_refresh_token"
} as const;

const common: CookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAME_SITE,
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {})
};

export const stateCookieOptions: CookieOptions = {
  ...common,
  signed: true,
  path: "/api/v1/auth/kakao",
  maxAge: 10 * 60 * 1000
};

export const accessCookieOptions: CookieOptions = {
  ...common,
  path: "/api/v1",
  maxAge: env.JWT_ACCESS_TTL_SECONDS * 1000
};

export const refreshCookieOptions: CookieOptions = {
  ...common,
  path: "/api/v1/auth",
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
};

export const stateClearOptions: CookieOptions = { ...stateCookieOptions, maxAge: undefined };
export const accessClearOptions: CookieOptions = { ...accessCookieOptions, maxAge: undefined };
export const refreshClearOptions: CookieOptions = { ...refreshCookieOptions, maxAge: undefined };
