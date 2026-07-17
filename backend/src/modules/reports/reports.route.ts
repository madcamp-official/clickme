import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate.js";
import { reportRateLimit } from "../../common/middleware/rateLimits.js";
import { validate } from "../../common/middleware/validate.js";
import { ReportsController } from "./reports.controller.js";
import { createReportSchema } from "./reports.schema.js";

const controller = new ReportsController();
export const reportsRouter = Router();
reportsRouter.post(
  "/",
  authenticate,
  reportRateLimit,
  validate(createReportSchema),
  controller.create
);
