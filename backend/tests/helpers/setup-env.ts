process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/wish_match_test";
process.env.DIRECT_URL = "postgresql://test:test@127.0.0.1:5432/wish_match_test";
process.env.CORS_ORIGINS = "http://localhost:3000";
process.env.KAKAO_REST_API_KEY = "test-rest-key";
process.env.KAKAO_CLIENT_SECRET = "test-client-secret";
process.env.KAKAO_REDIRECT_URI = "http://localhost:4000/api/v1/auth/kakao/callback";
process.env.FRONTEND_AUTH_SUCCESS_URL = "http://localhost:3000/auth/callback/success";
process.env.FRONTEND_AUTH_FAILURE_URL = "http://localhost:3000/auth/callback/failure";
process.env.PUBLIC_BASE_URL = "http://localhost:4000";
process.env.UPLOAD_DIR = "/tmp/wish-match-test-uploads";
process.env.JWT_ACCESS_SECRET =
  "test-only-jwt-secret-that-is-at-least-sixty-four-characters-long-1234567890";
process.env.COOKIE_SECRET = "test-only-cookie-secret-that-is-long-enough-1234567890";
process.env.COOKIE_SECURE = "false";
process.env.COOKIE_SAME_SITE = "lax";
process.env.ADMIN_KAKAO_USER_IDS = "999999";
