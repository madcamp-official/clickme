import type { Prisma, PrismaClient, User, AuthSession } from "../../generated/prisma/client.js";
import { prisma } from "../../infrastructure/prisma/client.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

export class AuthRepository {
  constructor(private readonly db: DbClient = prisma) {}

  findUserByKakaoId(kakaoUserId: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { kakaoUserId } });
  }

  createUser(data: Prisma.UserCreateInput): Promise<User> {
    return this.db.user.create({ data });
  }

  updateLogin(userId: string, makeAdmin: boolean): Promise<User> {
    return this.db.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
        ...(makeAdmin ? { role: "ADMIN" } : {})
      }
    });
  }

  promoteToAdmin(userId: string): Promise<User> {
    return this.db.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
  }

  findPublicUser(userId: string) {
    return this.db.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        nickname: true,
        profileImage: true,
        role: true,
        rating: true,
        reviewCount: true,
        createdAt: true
      }
    });
  }

  createSession(data: Prisma.AuthSessionUncheckedCreateInput): Promise<AuthSession> {
    return this.db.authSession.create({ data });
  }

  findSessionByRefreshHash(refreshTokenHash: string) {
    return this.db.authSession.findUnique({
      where: { refreshTokenHash },
      include: { user: true }
    });
  }

  rotateSession(input: {
    oldSessionId: string;
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    userAgent?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const revoked = await tx.authSession.updateMany({
        where: { id: input.oldSessionId, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { revokedAt: new Date(), lastUsedAt: new Date() }
      });
      if (revoked.count !== 1) return null;
      return tx.authSession.create({
        data: {
          userId: input.userId,
          refreshTokenHash: input.refreshTokenHash,
          expiresAt: input.expiresAt,
          ...(input.userAgent ? { userAgent: input.userAgent } : {})
        }
      });
    });
  }

  async revokeByRefreshHash(refreshTokenHash: string): Promise<void> {
    await this.db.authSession.updateMany({
      where: { refreshTokenHash, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }
}
