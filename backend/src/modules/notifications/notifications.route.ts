import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate.js";
import { validate } from "../../common/middleware/validate.js";
import { NotificationsController } from "./notifications.controller.js";
import { notificationIdSchema, notificationListSchema } from "./notifications.schema.js";

const controller = new NotificationsController();
export const notificationsRouter = Router();

notificationsRouter.use(authenticate);
notificationsRouter.get("/", validate(notificationListSchema), controller.list);
notificationsRouter.patch("/read-all", controller.markAllRead);
notificationsRouter.patch("/:id/read", validate(notificationIdSchema), controller.markRead);
