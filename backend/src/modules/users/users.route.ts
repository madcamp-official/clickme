import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate.js";
import { validate } from "../../common/middleware/validate.js";
import { UsersController } from "./users.controller.js";
import { updateMeSchema, userIdSchema, userListSchema } from "./users.schema.js";

const controller = new UsersController();
export const usersRouter = Router();
usersRouter.patch("/me", authenticate, validate(updateMeSchema), controller.updateMe);
usersRouter.get("/:id/posts", validate(userListSchema), controller.posts);
usersRouter.get("/:id/reviews", validate(userListSchema), controller.reviews);
usersRouter.get("/:id", validate(userIdSchema), controller.get);
