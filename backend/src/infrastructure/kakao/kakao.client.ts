import { env } from "../../config/env.js";
import { AppError } from "../../common/errors/AppError.js";
import { kakaoProfileSchema, kakaoTokenSchema } from "./kakao.schemas.js";
import type { KakaoOAuthClient, KakaoProfile } from "./kakao.types.js";

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
  } catch {
    throw new AppError("KAKAO_PROFILE_FETCH_FAILED", "카카오 서버 요청에 실패했습니다.", 502);
  }
}

export class KakaoRestClient implements KakaoOAuthClient {
  async exchangeCode(code: string): Promise<string> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.KAKAO_REST_API_KEY,
      client_secret: env.KAKAO_CLIENT_SECRET,
      redirect_uri: env.KAKAO_REDIRECT_URI,
      code
    });
    let response: Response;
    try {
      response = await fetchWithTimeout("https://kauth.kakao.com/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
        body
      });
    } catch {
      throw new AppError("KAKAO_TOKEN_EXCHANGE_FAILED", "카카오 인증에 실패했습니다.", 502);
    }
    if (!response.ok)
      throw new AppError("KAKAO_TOKEN_EXCHANGE_FAILED", "카카오 인증에 실패했습니다.", 502);
    const parsed = kakaoTokenSchema.safeParse(await response.json());
    if (!parsed.success)
      throw new AppError("KAKAO_RESPONSE_INVALID", "카카오 응답 형식이 올바르지 않습니다.", 502);
    return parsed.data.access_token;
  }

  async fetchProfile(accessToken: string): Promise<KakaoProfile> {
    const propertyKeys = JSON.stringify(["kakao_account.profile"]);
    const response = await fetchWithTimeout(
      `https://kapi.kakao.com/v2/user/me?secure_resource=true&property_keys=${encodeURIComponent(propertyKeys)}`,
      { headers: { authorization: `Bearer ${accessToken}` } }
    );
    if (!response.ok)
      throw new AppError("KAKAO_PROFILE_FETCH_FAILED", "카카오 프로필 조회에 실패했습니다.", 502);
    const rawBody = await response.text();
    let unknownBody: unknown;
    try {
      unknownBody = JSON.parse(rawBody.replace(/("id"\s*:\s*)(\d+)/, '$1"$2"')) as unknown;
    } catch {
      throw new AppError("KAKAO_RESPONSE_INVALID", "카카오 응답 형식이 올바르지 않습니다.", 502);
    }
    const parsed = kakaoProfileSchema.safeParse(unknownBody);
    if (!parsed.success)
      throw new AppError("KAKAO_RESPONSE_INVALID", "카카오 응답 형식이 올바르지 않습니다.", 502);
    const profile = parsed.data.kakao_account?.profile;
    return {
      kakaoUserId: String(parsed.data.id),
      ...(profile?.nickname ? { nickname: profile.nickname } : {}),
      ...(profile?.profile_image_url ? { profileImage: profile.profile_image_url } : {})
    };
  }
}
