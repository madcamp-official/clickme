import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate.js";
import { validate } from "../../common/middleware/validate.js";
import { FavoritesController } from "./favorites.controller.js";
import { favoritePostSchema, favoritesListSchema } from "./favorites.schema.js";

const controller = new FavoritesController();
export const favoritesRouter = Router();
favoritesRouter.post(
  "/posts/:postId/favorite",
  authenticate,
  validate(favoritePostSchema),
  controller.add
);
favoritesRouter.delete(
  "/posts/:postId/favorite",
  authenticate,
  validate(favoritePostSchema),
  controller.remove
);
favoritesRouter.get("/favorites", authenticate, validate(favoritesListSchema), controller.list);
