import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate.js";
import { validate } from "../../common/middleware/validate.js";
import { UsersController } from "./users.controller.js";
import {
  myListSchema,
  updateMeSchema,
  updateProfileImageSchema,
  userIdSchema,
  userListSchema
} from "./users.schema.js";

const controller = new UsersController();
export const usersRouter = Router();
usersRouter.patch("/me", authenticate, validate(updateMeSchema), controller.updateMe);
usersRouter.put(
  "/me/profile-image",
  authenticate,
  validate(updateProfileImageSchema),
  controller.updateProfileImage
);
usersRouter.delete("/me/profile-image", authenticate, controller.removeProfileImage);
usersRouter.get("/me/posts", authenticate, validate(myListSchema), controller.myPosts);
usersRouter.get("/:id/posts", validate(userListSchema), controller.posts);
usersRouter.get("/:id/reviews", validate(userListSchema), controller.reviews);
usersRouter.get("/:id", validate(userIdSchema), controller.get);
