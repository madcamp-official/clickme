import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate.js";
import { validate } from "../../common/middleware/validate.js";
import { PurchaseRequestsController } from "./purchase-requests.controller.js";
import {
  createPurchaseRequestSchema,
  purchaseRequestIdSchema,
  purchaseRequestListSchema
} from "./purchase-requests.schema.js";

const controller = new PurchaseRequestsController();
export const purchaseRequestsRouter = Router();
purchaseRequestsRouter.use(authenticate);
purchaseRequestsRouter.get("/", validate(purchaseRequestListSchema), controller.list);
purchaseRequestsRouter.post("/", validate(createPurchaseRequestSchema), controller.create);
purchaseRequestsRouter.get("/:id", validate(purchaseRequestIdSchema), controller.get);
purchaseRequestsRouter.post("/:id/accept", validate(purchaseRequestIdSchema), controller.accept);
purchaseRequestsRouter.delete("/:id", validate(purchaseRequestIdSchema), controller.cancel);
