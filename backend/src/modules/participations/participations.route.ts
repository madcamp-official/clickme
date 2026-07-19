import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate.js";
import { validate } from "../../common/middleware/validate.js";
import { ParticipationsController } from "./participations.controller.js";
import {
  createParticipationSchema,
  participationIdSchema,
  participationListSchema
} from "./participations.schema.js";

const controller = new ParticipationsController();
export const participationsRouter = Router();
participationsRouter.post(
  "/posts/:postId/participations",
  authenticate,
  validate(createParticipationSchema),
  controller.create
);
participationsRouter.get(
  "/participations/me",
  authenticate,
  validate(participationListSchema),
  controller.list
);
participationsRouter.delete(
  "/participations/:id",
  authenticate,
  validate(participationIdSchema),
  controller.cancel
);
