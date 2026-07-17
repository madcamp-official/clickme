import { SignJWT, errors, jwtVerify } from "jose";
import { z } from "zod";
import type { UserRole } from "../../generated/prisma/enums.js";
import { env } from "../../config/env.js";
import { AppError } from "../errors/AppError.js";
import { randomId } from "./crypto.js";

const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const claimsSchema = z.object({
  sub: z.string().min(1),
  sid: z.string().min(1),
  role: z.enum(["USER", "ADMIN"]),
  type: z.literal("access")
});

export async function signAccessToken(input: {
  userId: string;
  sessionId: string;
  role: UserRole;
}): Promise<string> {
  return new SignJWT({ sid: input.sessionId, role: input.role, type: "access" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.userId)
    .setIssuer(env.JWT_ACCESS_ISSUER)
    .setAudience(env.JWT_ACCESS_AUDIENCE)
    .setJti(randomId())
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_ACCESS_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<z.infer<typeof claimsSchema>> {
  try {
    const verified = await jwtVerify(token, secret, {
      issuer: env.JWT_ACCESS_ISSUER,
      audience: env.JWT_ACCESS_AUDIENCE,
      algorithms: ["HS256"]
    });
    return claimsSchema.parse(verified.payload);
  } catch (error) {
    if (error instanceof errors.JWTExpired) {
      throw new AppError("ACCESS_TOKEN_EXPIRED", "Access Token이 만료되었습니다.", 401);
    }
    throw new AppError("ACCESS_TOKEN_INVALID", "유효하지 않은 Access Token입니다.", 401);
  }
}
