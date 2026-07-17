import { Router } from "express";
import { HealthController } from "./health.controller.js";

const controller = new HealthController();
export const healthRouter = Router();
healthRouter.get("/", controller.get);
