import type { Request, Response } from "express";
import {
  accessClearOptions,
  accessCookieOptions,
  cookieNames,
  refreshClearOptions,
  refreshCookieOptions,
  stateClearOptions,
  stateCookieOptions
} from "../../config/cookies.js";
import { env } from "../../config/env.js";
import { AppError } from "../../common/errors/AppError.js";
import { ok } from "../../common/types/api.js";
import { randomBase64Url, safeEqual } from "../../common/utils/crypto.js";
import { AuthService } from "./auth.service.js";

export class AuthController {
  constructor(private readonly service = new AuthService()) {}

  start = (_req: Request, res: Response): void => {
    const state = randomBase64Url(32);
    res.cookie(cookieNames.state, state, stateCookieOptions);
    const url = new URL("https://kauth.kakao.com/oauth/authorize");
    url.search = new URLSearchParams({
      client_id: env.KAKAO_REST_API_KEY,
      redirect_uri: env.KAKAO_REDIRECT_URI,
      response_type: "code",
      state,
      scope: "profile_nickname,profile_image"
    }).toString();
    res.redirect(302, url.toString());
  };

  callback = async (req: Request, res: Response): Promise<void> => {
    const stored = req.signedCookies[cookieNames.state] as string | false | undefined;
    res.clearCookie(cookieNames.state, stateClearOptions);
    const fail = (error: AppError): void => {
      const url = new URL(env.FRONTEND_AUTH_FAILURE_URL);
      url.searchParams.set("error", error.code);
      res.redirect(302, url.toString());
    };
    try {
      if (typeof req.query.error === "string") {
        throw new AppError("KAKAO_LOGIN_CANCELLED", "카카오 로그인이 취소되었습니다.", 401);
      }
      const state = typeof req.query.state === "string" ? req.query.state : undefined;
      if (!state || !stored || !safeEqual(state, stored)) {
        throw new AppError("KAKAO_STATE_INVALID", "OAuth state가 유효하지 않습니다.", 400);
      }
      const code = typeof req.query.code === "string" ? req.query.code : undefined;
      if (!code) throw new AppError("KAKAO_CODE_MISSING", "카카오 인가 코드가 없습니다.", 400);
      const issued = await this.service.kakaoLogin(code, req.get("user-agent"));
      res.cookie(cookieNames.access, issued.accessToken, accessCookieOptions);
      res.cookie(cookieNames.refresh, issued.refreshToken, refreshCookieOptions);
      res.redirect(302, env.FRONTEND_AUTH_SUCCESS_URL);
    } catch (error) {
      fail(
        error instanceof AppError
          ? error
          : new AppError("KAKAO_PROFILE_FETCH_FAILED", "카카오 로그인에 실패했습니다.", 502)
      );
    }
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const raw = req.cookies[cookieNames.refresh] as string | undefined;
    const issued = await this.service.refresh(raw, req.get("user-agent"));
    res.cookie(cookieNames.access, issued.accessToken, accessCookieOptions);
    res.cookie(cookieNames.refresh, issued.refreshToken, refreshCookieOptions);
    res.json(ok({ user: issued.user, accessExpiresAt: issued.accessExpiresAt }));
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    await this.service.logout(req.cookies[cookieNames.refresh] as string | undefined);
    res.clearCookie(cookieNames.access, accessClearOptions);
    res.clearCookie(cookieNames.refresh, refreshClearOptions);
    res.clearCookie(cookieNames.state, stateClearOptions);
    res.status(204).end();
  };

  me = async (req: Request, res: Response): Promise<void> => {
    res.json(ok(await this.service.me(req.auth!.userId)));
  };
}
