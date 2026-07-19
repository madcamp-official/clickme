import compression from "compression";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import pino from "pino";
import { pinoHttp } from "pino-http";
import swaggerUi from "swagger-ui-express";
import { apiRateLimit } from "./common/middleware/rateLimits.js";
import { errorHandler } from "./common/errors/errorHandler.js";
import { notFound } from "./common/middleware/notFound.js";
import { requestId } from "./common/middleware/requestId.js";
import { corsMiddleware } from "./config/cors.js";
import { env } from "./config/env.js";
import { openApiDocument } from "./config/openapi.js";
import { adminRouter } from "./modules/admin/admin.route.js";
import { authRouter } from "./modules/auth/auth.route.js";
import { eventsRouter } from "./modules/events/events.route.js";
import { favoritesRouter } from "./modules/favorites/favorites.route.js";
import { healthRouter } from "./modules/health/health.route.js";
import { inquiriesRouter } from "./modules/inquiries/inquiries.route.js";
import { postsRouter } from "./modules/posts/posts.route.js";
import { participationsRouter } from "./modules/participations/participations.route.js";
import { purchaseRequestsRouter } from "./modules/purchase-requests/purchase-requests.route.js";
import { reportsRouter } from "./modules/reports/reports.route.js";
import { reviewsRouter } from "./modules/reviews/reviews.route.js";
import { storesRouter } from "./modules/stores/stores.route.js";
import { usersRouter } from "./modules/users/users.route.js";

const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
      "res.headers.set-cookie",
      "body.password",
      "access_token",
      "refresh_token",
      "client_secret",
      "KAKAO_CLIENT_SECRET",
      "JWT_ACCESS_SECRET"
    ],
    censor: "[REDACTED]"
  }
});

export function createApp(): express.Express {
  const app = express();
  app.set("trust proxy", env.TRUST_PROXY);
  app.disable("x-powered-by");
  app.use(requestId);
  app.use(pinoHttp({ logger, genReqId: (req) => req.id }));
  app.use(helmet());
  app.use(corsMiddleware);
  app.use(compression());
  // 모집 대표 사진은 브라우저에서 압축된 data URL로 전달됩니다. 다른 API는
  // 기존의 작은 JSON 제한을 유지해 불필요하게 큰 요청을 받지 않습니다.
  app.use("/api/v1/posts", express.json({ limit: "500kb" }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser(env.COOKIE_SECRET));
  app.use(
    "/api/v1/uploads",
    express.static(env.UPLOAD_DIR, {
      dotfiles: "deny",
      index: false,
      setHeaders: (res) => {
        // 사용자가 사진을 삭제하면 CDN이나 브라우저 캐시에서도 이전
        // 사진이 계속 노출되지 않도록 매 요청마다 origin에서 확인합니다.
        res.setHeader("Cache-Control", "private, no-store");
      }
    })
  );
  app.use("/api/v1", apiRateLimit);

  app.use("/api/v1/health", healthRouter);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/inquiries", inquiriesRouter);
  app.use("/api/v1/users", usersRouter);
  app.use("/api/v1/stores", storesRouter);
  app.use("/api/v1/events", eventsRouter);
  app.use("/api/v1/posts", postsRouter);
  app.use("/api/v1/purchase-requests", purchaseRequestsRouter);
  app.use("/api/v1/reviews", reviewsRouter);
  app.use("/api/v1/reports", reportsRouter);
  app.use("/api/v1/admin", adminRouter);
  app.use("/api/v1", favoritesRouter);
  app.use("/api/v1", participationsRouter);

  app.get("/api-docs.json", (_req, res) => res.json(openApiDocument));
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export const app = createApp();
