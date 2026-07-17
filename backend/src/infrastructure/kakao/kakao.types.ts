export interface KakaoProfile {
  kakaoUserId: string;
  nickname?: string;
  profileImage?: string;
}

export interface KakaoOAuthClient {
  exchangeCode(code: string): Promise<string>;
  fetchProfile(accessToken: string): Promise<KakaoProfile>;
}
