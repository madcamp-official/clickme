import { describe, expect, it, vi } from "vitest";
import type { AuthSession, User } from "../../src/generated/prisma/client.js";
import type { KakaoOAuthClient } from "../../src/infrastructure/kakao/kakao.types.js";
import type { AuthRepository } from "../../src/modules/auth/auth.repository.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";

const user = (overrides: Partial<User> = {}): User => ({
  id: "user-1",
  kakaoUserId: "123456",
  nickname: "위시_123456",
  profileImage: null,
  role: "USER",
  status: "ACTIVE",
  rating: 0,
  reviewCount: 0,
  lastLoginAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  suspendedAt: null,
  suspensionReason: null,
  deletedAt: null,
  ...overrides
});

const session = (overrides: Partial<AuthSession> = {}): AuthSession => ({
  id: "session-1",
  userId: "user-1",
  refreshTokenHash: "a".repeat(64),
  expiresAt: new Date(Date.now() + 60_000),
  revokedAt: null,
  lastUsedAt: null,
  userAgent: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

describe("AuthService", () => {
  it("automatically creates a user and stores the Kakao ID as a string", async () => {
    const createUser = vi.fn().mockResolvedValue(user());
    const repository = {
      findUserByKakaoId: vi.fn().mockResolvedValue(null),
      createUser,
      createSession: vi.fn().mockResolvedValue(session())
    } as unknown as AuthRepository;
    const kakao = {
      exchangeCode: vi.fn().mockResolvedValue("temporary-token"),
      fetchProfile: vi.fn().mockResolvedValue({ kakaoUserId: "123456", nickname: "위시" })
    } satisfies KakaoOAuthClient;
    const issued = await new AuthService(repository, kakao).kakaoLogin("code");
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ kakaoUserId: "123456" }));
    expect(issued.accessToken.split(".")).toHaveLength(3);
    expect(issued.refreshToken.length).toBeGreaterThan(40);
  });

  it("blocks a suspended existing user", async () => {
    const suspended = user({ status: "SUSPENDED" });
    const updateLogin = vi.fn().mockResolvedValue(suspended);
    const repository = {
      findUserByKakaoId: vi.fn().mockResolvedValue(suspended),
      updateLogin
    } as unknown as AuthRepository;
    const kakao = {
      exchangeCode: vi.fn().mockResolvedValue("temporary-token"),
      fetchProfile: vi.fn().mockResolvedValue({ kakaoUserId: "123456" })
    } satisfies KakaoOAuthClient;
    await expect(new AuthService(repository, kakao).kakaoLogin("code")).rejects.toMatchObject({
      code: "USER_SUSPENDED"
    });
    expect(updateLogin).toHaveBeenCalledWith("user-1", false);
  });

  it("rotates a valid refresh session and rejects a revoked one", async () => {
    const activeUser = user();
    const repository = {
      findSessionByRefreshHash: vi
        .fn()
        .mockResolvedValueOnce({ ...session(), user: activeUser })
        .mockResolvedValueOnce({ ...session({ revokedAt: new Date() }), user: activeUser }),
      rotateSession: vi.fn().mockResolvedValue(session({ id: "session-2" }))
    } as unknown as AuthRepository;
    const service = new AuthService(repository, {} as KakaoOAuthClient);
    const rotated = await service.refresh("raw-refresh-token");
    expect(rotated.accessToken).toBeTruthy();
    await expect(service.refresh("already-used-token")).rejects.toMatchObject({
      code: "SESSION_REVOKED"
    });
  });
});
