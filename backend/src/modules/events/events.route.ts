import { Router } from "express";
import { validate } from "../../common/middleware/validate.js";
import { EventsController } from "./events.controller.js";
import { eventIdSchema, eventListSchema } from "./events.schema.js";

const controller = new EventsController();
export const eventsRouter = Router();
eventsRouter.get("/", validate(eventListSchema), controller.list);
eventsRouter.get("/:id", validate(eventIdSchema), controller.get);
