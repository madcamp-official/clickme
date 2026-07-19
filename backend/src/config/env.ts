import "dotenv/config";
import { z } from "zod";

const booleanString = z.enum(["true", "false"]).transform((value) => value === "true");
const postgresUrl = z.url().refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  },
  { message: "유효한 PostgreSQL 연결 URL이어야 합니다." }
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    TRUST_PROXY: z.coerce.number().int().min(0).default(1),
    DATABASE_URL: postgresUrl,
    DIRECT_URL: postgresUrl,
    CORS_ORIGINS: z.string().min(1),
    KAKAO_REST_API_KEY: z.string().min(1),
    KAKAO_CLIENT_SECRET: z.string().min(1),
    KAKAO_REDIRECT_URI: z.url(),
    FRONTEND_AUTH_SUCCESS_URL: z.url(),
    FRONTEND_AUTH_FAILURE_URL: z.url(),
    PUBLIC_BASE_URL: z.url().default("http://localhost:4000"),
    UPLOAD_DIR: z.string().min(1).default("/tmp/wish-match-uploads"),
    JWT_ACCESS_SECRET: z.string().min(64),
    JWT_ACCESS_ISSUER: z.string().min(1).default("wish-match-api"),
    JWT_ACCESS_AUDIENCE: z.string().min(1).default("wish-match-web"),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    COOKIE_SECRET: z.string().min(32),
    COOKIE_SECURE: booleanString.default(false),
    COOKIE_SAME_SITE: z.enum(["lax", "none", "strict"]).default("lax"),
    COOKIE_DOMAIN: z
      .string()
      .optional()
      .transform((value) => value || undefined),
    ADMIN_KAKAO_USER_IDS: z.string().default("")
  })
  .superRefine((value, ctx) => {
    const origins = value.CORS_ORIGINS.split(",").map((origin) => origin.trim());
    if (origins.some((origin) => origin === "*" || !URL.canParse(origin))) {
      ctx.addIssue({
        code: "custom",
        path: ["CORS_ORIGINS"],
        message: "CORS_ORIGINS에는 유효한 origin만 지정해야 하며 wildcard는 사용할 수 없습니다."
      });
    }
    if (value.COOKIE_SAME_SITE === "none" && !value.COOKIE_SECURE) {
      ctx.addIssue({
        code: "custom",
        path: ["COOKIE_SECURE"],
        message: "SameSite=None 쿠키는 Secure=true여야 합니다."
      });
    }
    if (value.NODE_ENV === "production" && !value.COOKIE_SECURE) {
      ctx.addIssue({
        code: "custom",
        path: ["COOKIE_SECURE"],
        message: "운영 환경에서는 Secure cookie가 필수입니다."
      });
    }
    if (value.NODE_ENV === "production" && !value.PUBLIC_BASE_URL.startsWith("https://")) {
      ctx.addIssue({
        code: "custom",
        path: ["PUBLIC_BASE_URL"],
        message: "운영 환경의 PUBLIC_BASE_URL은 HTTPS여야 합니다."
      });
    }
  });

export type Env = z.infer<typeof envSchema> & {
  corsOrigins: string[];
  adminKakaoUserIds: Set<string>;
};

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.parse(source);
  return {
    ...parsed,
    corsOrigins: parsed.CORS_ORIGINS.split(",").map((value) => value.trim()),
    adminKakaoUserIds: new Set(
      parsed.ADMIN_KAKAO_USER_IDS.split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  };
}

export const env = parseEnv(process.env);
