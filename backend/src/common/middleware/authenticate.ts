import type { RequestHandler } from "express";
import { UserRole, UserStatus } from "../../generated/prisma/enums.js";
import { cookieNames } from "../../config/cookies.js";
import { isConfiguredAdminUser } from "../../config/env.js";
import { prisma } from "../../infrastructure/prisma/client.js";
import { AppError } from "../errors/AppError.js";
import { verifyAccessToken } from "../utils/jwt.js";

function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  return /^Bearer\s+(.+)$/i.exec(header)?.[1];
}

export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const cookies = req.cookies as Record<string, string | undefined>;
    const token = bearerToken(req.get("authorization")) ?? cookies[cookieNames.access];
    if (!token) throw new AppError("ACCESS_TOKEN_MISSING", "로그인이 필요합니다.", 401);
    const claims = await verifyAccessToken(token);
    const session = await prisma.authSession.findUnique({
      where: { id: claims.sid },
      include: { user: true }
    });
    const now = new Date();
    if (
      !session ||
      session.userId !== claims.sub ||
      session.revokedAt ||
      session.expiresAt <= now
    ) {
      throw new AppError("SESSION_REVOKED", "로그인 세션이 유효하지 않습니다.", 401);
    }
    if (session.user.status !== UserStatus.ACTIVE || session.user.deletedAt) {
      throw new AppError("USER_SUSPENDED", "이용할 수 없는 사용자입니다.", 403);
    }
    let effectiveRole = session.user.role;
    if (effectiveRole !== UserRole.ADMIN && isConfiguredAdminUser(session.user)) {
      await prisma.user.update({ where: { id: session.userId }, data: { role: UserRole.ADMIN } });
      effectiveRole = UserRole.ADMIN;
    }
    req.auth = { userId: session.userId, sessionId: session.id, role: effectiveRole };
    next();
  } catch (error) {
    next(error);
  }
};

export const optionalAuthenticate: RequestHandler = async (req, res, next) => {
  const cookies = req.cookies as Record<string, string | undefined>;
  if (!req.get("authorization") && !cookies[cookieNames.access]) {
    next();
    return;
  }
  await authenticate(req, res, next);
};
