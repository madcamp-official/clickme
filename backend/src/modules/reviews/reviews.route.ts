import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate.js";
import { validate } from "../../common/middleware/validate.js";
import { ReviewsController } from "./reviews.controller.js";
import { createReviewSchema, myReviewListSchema, reviewListSchema } from "./reviews.schema.js";

const controller = new ReviewsController();
export const reviewsRouter = Router();
reviewsRouter.post("/", authenticate, validate(createReviewSchema), controller.create);
reviewsRouter.get("/me", authenticate, validate(myReviewListSchema), controller.myReviews);
reviewsRouter.get("/users/:userId", validate(reviewListSchema), controller.list);
