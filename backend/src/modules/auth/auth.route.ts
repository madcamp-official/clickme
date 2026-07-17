import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate.js";
import { oauthRateLimit, refreshRateLimit } from "../../common/middleware/rateLimits.js";
import { AuthController } from "./auth.controller.js";

export function createAuthRouter(controller = new AuthController()): Router {
  const router = Router();
  router.get("/kakao/start", oauthRateLimit, controller.start);
  router.get("/kakao/callback", oauthRateLimit, controller.callback);
  router.post("/refresh", refreshRateLimit, controller.refresh);
  router.post("/logout", controller.logout);
  router.get("/me", authenticate, controller.me);
  return router;
}

export const authRouter = createAuthRouter();
