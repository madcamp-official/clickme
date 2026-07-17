import { Router } from "express";
import { authenticate, optionalAuthenticate } from "../../common/middleware/authenticate.js";
import { validate } from "../../common/middleware/validate.js";
import { PostsController } from "./posts.controller.js";
import {
  createPostSchema,
  postIdSchema,
  postListSchema,
  remainCountSchema,
  updatePostSchema
} from "./posts.schema.js";

const controller = new PostsController();
export const postsRouter = Router();
postsRouter.get("/", validate(postListSchema), controller.list);
postsRouter.get("/:id", optionalAuthenticate, validate(postIdSchema), controller.get);
postsRouter.post("/", authenticate, validate(createPostSchema), controller.create);
postsRouter.patch("/:id", authenticate, validate(updatePostSchema), controller.update);
postsRouter.delete("/:id", authenticate, validate(postIdSchema), controller.delete);
postsRouter.patch("/:id/close", authenticate, validate(postIdSchema), controller.close);
postsRouter.patch(
  "/:id/remain-count",
  authenticate,
  validate(remainCountSchema),
  controller.remain
);
