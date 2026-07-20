import { Prisma, UserStatus, type User } from "../../generated/prisma/client.js";
import { env, isConfiguredAdminUser } from "../../config/env.js";
import { AppError } from "../../common/errors/AppError.js";
import { randomBase64Url, sha256 } from "../../common/utils/crypto.js";
import { signAccessToken } from "../../common/utils/jwt.js";
import { nicknameCandidate, normalizeNickname } from "../../common/utils/nickname.js";
import type { KakaoOAuthClient } from "../../infrastructure/kakao/kakao.types.js";
import { KakaoRestClient } from "../../infrastructure/kakao/kakao.client.js";
import { AuthRepository } from "./auth.repository.js";

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  user: ReturnType<typeof publicUser>;
}

const publicUser = (user: User) => ({
  id: user.id,
  nickname: user.nickname,
  profileImage: user.profileImage,
  role: user.role,
  rating: user.rating,
  reviewCount: user.reviewCount,
  createdAt: user.createdAt.toISOString()
});

export class AuthService {
  constructor(
    private readonly repository = new AuthRepository(),
    private readonly kakaoClient: KakaoOAuthClient = new KakaoRestClient()
  ) {}

  private expiresAt(): Date {
    return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60_000);
  }

  private async issue(user: User, userAgent?: string): Promise<IssuedSession> {
    const refreshToken = randomBase64Url(48);
    const session = await this.repository.createSession({
      userId: user.id,
      refreshTokenHash: sha256(refreshToken),
      expiresAt: this.expiresAt(),
      ...(userAgent ? { userAgent } : {})
    });
    const accessToken = await signAccessToken({
      userId: user.id,
      sessionId: session.id,
      role: user.role
    });
    return {
      accessToken,
      refreshToken,
      accessExpiresAt: new Date(Date.now() + env.JWT_ACCESS_TTL_SECONDS * 1000).toISOString(),
      user: publicUser(user)
    };
  }

  private async createUniqueUser(input: {
    kakaoUserId: string;
    nickname?: string;
    profileImage?: string;
    makeAdmin: boolean;
  }): Promise<User> {
    const base = normalizeNickname(input.nickname);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const stableSuffix = input.kakaoUserId.slice(-6).padStart(6, "0");
      const suffix = attempt === 0 ? stableSuffix : randomBase64Url(4).slice(0, 6);
      try {
        return await this.repository.createUser({
          kakaoUserId: input.kakaoUserId,
          nickname: nicknameCandidate(base, suffix),
          ...(input.profileImage ? { profileImage: input.profileImage } : {}),
          role: input.makeAdmin ? "ADMIN" : "USER"
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002")
          throw error;
      }
    }
    throw new AppError("NICKNAME_ALREADY_EXISTS", "사용 가능한 닉네임을 만들지 못했습니다.", 409);
  }

  async kakaoLogin(code: string, userAgent?: string): Promise<IssuedSession> {
    const kakaoAccessToken = await this.kakaoClient.exchangeCode(code);
    const profile = await this.kakaoClient.fetchProfile(kakaoAccessToken);
    const kakaoUserId = String(profile.kakaoUserId);
    let user = await this.repository.findUserByKakaoId(kakaoUserId);
    if (!user) {
      user = await this.createUniqueUser({
        ...profile,
        kakaoUserId,
        makeAdmin: env.adminKakaoUserIds.has(kakaoUserId)
      });
    } else {
      // Kakao 프로필은 최초 가입 시에만 기본값으로 사용합니다. 이후에는 사용자가
      // 서비스에서 선택하거나 삭제한 프로필 사진을 다시 로그인해도 보존합니다.
      user = await this.repository.updateLogin(user.id, isConfiguredAdminUser(user));
    }
    if (user.status === UserStatus.SUSPENDED || user.deletedAt) {
      throw new AppError("USER_SUSPENDED", "이용이 정지된 사용자입니다.", 403);
    }
    return this.issue(user, userAgent);
  }

  async refresh(rawToken: string | undefined, userAgent?: string): Promise<IssuedSession> {
    if (!rawToken) throw new AppError("REFRESH_TOKEN_MISSING", "Refresh Token이 없습니다.", 401);
    const session = await this.repository.findSessionByRefreshHash(sha256(rawToken));
    if (!session)
      throw new AppError("REFRESH_TOKEN_INVALID", "유효하지 않은 Refresh Token입니다.", 401);
    if (session.revokedAt) throw new AppError("SESSION_REVOKED", "이미 사용된 세션입니다.", 401);
    if (session.expiresAt <= new Date()) {
      throw new AppError("REFRESH_TOKEN_EXPIRED", "Refresh Token이 만료되었습니다.", 401);
    }
    if (session.user.status !== UserStatus.ACTIVE || session.user.deletedAt) {
      throw new AppError("USER_SUSPENDED", "이용할 수 없는 사용자입니다.", 403);
    }
    let sessionUser = session.user;
    if (sessionUser.role !== "ADMIN" && isConfiguredAdminUser(sessionUser)) {
      sessionUser = await this.repository.promoteToAdmin(sessionUser.id);
    }
    const refreshToken = randomBase64Url(48);
    const next = await this.repository.rotateSession({
      oldSessionId: session.id,
      userId: session.userId,
      refreshTokenHash: sha256(refreshToken),
      expiresAt: this.expiresAt(),
      ...(userAgent ? { userAgent } : {})
    });
    if (!next) throw new AppError("SESSION_REVOKED", "이미 사용된 세션입니다.", 401);
    const accessToken = await signAccessToken({
      userId: session.userId,
      sessionId: next.id,
      role: sessionUser.role
    });
    return {
      accessToken,
      refreshToken,
      accessExpiresAt: new Date(Date.now() + env.JWT_ACCESS_TTL_SECONDS * 1000).toISOString(),
      user: publicUser(sessionUser)
    };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (rawToken) await this.repository.revokeByRefreshHash(sha256(rawToken));
  }

  async me(userId: string) {
    const user = await this.repository.findPublicUser(userId);
    if (!user) throw new AppError("USER_NOT_FOUND", "사용자를 찾을 수 없습니다.", 404);
    return user;
  }
}
