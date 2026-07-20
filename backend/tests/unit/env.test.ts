import { describe, expect, it } from "vitest";
import { parseEnv } from "../../src/config/env.js";

const valid = (): NodeJS.ProcessEnv => ({
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  DIRECT_URL: "postgresql://test:test@localhost:5432/test",
  CORS_ORIGINS: "http://localhost:3000",
  KAKAO_REST_API_KEY: "key",
  KAKAO_CLIENT_SECRET: "secret",
  KAKAO_REDIRECT_URI: "http://localhost:4000/api/v1/auth/kakao/callback",
  FRONTEND_AUTH_SUCCESS_URL: "http://localhost:3000/success",
  FRONTEND_AUTH_FAILURE_URL: "http://localhost:3000/failure",
  PUBLIC_BASE_URL: "http://localhost:4000",
  UPLOAD_DIR: "/tmp/wish-match-test-uploads",
  JWT_ACCESS_SECRET: "x".repeat(64),
  COOKIE_SECRET: "y".repeat(32),
  COOKIE_SECURE: "false",
  COOKIE_SAME_SITE: "lax"
});

describe("environment validation", () => {
  it("rejects wildcard CORS", () => {
    expect(() => parseEnv({ ...valid(), CORS_ORIGINS: "*" })).toThrow();
  });
  it("requires secure cookies with SameSite=None", () => {
    expect(() => parseEnv({ ...valid(), COOKIE_SAME_SITE: "none" })).toThrow();
  });
  it("rejects missing or non-PostgreSQL database URLs", () => {
    expect(() => parseEnv({ ...valid(), DATABASE_URL: "your-database-url" })).toThrow();
    expect(() => parseEnv({ ...valid(), DIRECT_URL: "https://example.com/database" })).toThrow();
  });
  it("parses explicit origins and admin Kakao IDs", () => {
    const env = parseEnv({
      ...valid(),
      CORS_ORIGINS: "http://localhost:3000,https://wish.example",
      ADMIN_KAKAO_USER_IDS: "1, 2, legacy-user-id",
      ADMIN_USER_IDS: "user-1, user-2"
    });
    expect(env.corsOrigins).toEqual(["http://localhost:3000", "https://wish.example"]);
    expect(env.adminKakaoUserIds.has("2")).toBe(true);
    expect(env.adminKakaoUserIds.has("legacy-user-id")).toBe(true);
    expect(env.adminUserIds).toEqual(new Set(["user-1", "user-2", "legacy-user-id"]));
  });
});
