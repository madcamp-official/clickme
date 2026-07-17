import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums.js";
import { authenticate } from "../../common/middleware/authenticate.js";
import { authorize } from "../../common/middleware/authorize.js";
import { adminMutationRateLimit } from "../../common/middleware/rateLimits.js";
import { requireActiveUser } from "../../common/middleware/requireActiveUser.js";
import { validate } from "../../common/middleware/validate.js";
import { AdminController } from "./admin.controller.js";
import {
  adminCreateEventSchema,
  adminCreateStoreSchema,
  adminDeletePostSchema,
  adminIdSchema,
  adminPostsSchema,
  adminReportsSchema,
  adminRestorePostSchema,
  adminUpdateEventSchema,
  adminUpdateStoreSchema,
  adminUsersSchema,
  handleReportSchema,
  suspendSchema,
  unsuspendSchema
} from "./admin.schema.js";

const controller = new AdminController();
export const adminRouter = Router();
adminRouter.use(authenticate, requireActiveUser, authorize(UserRole.ADMIN));
adminRouter.get("/reports", validate(adminReportsSchema), controller.reports);
adminRouter.get("/reports/:id", validate(adminIdSchema), controller.report);
adminRouter.patch(
  "/reports/:id",
  adminMutationRateLimit,
  validate(handleReportSchema),
  controller.handleReport
);
adminRouter.get("/users", validate(adminUsersSchema), controller.users);
adminRouter.patch(
  "/users/:id/suspend",
  adminMutationRateLimit,
  validate(suspendSchema),
  controller.suspend
);
adminRouter.patch(
  "/users/:id/unsuspend",
  adminMutationRateLimit,
  validate(unsuspendSchema),
  controller.unsuspend
);
adminRouter.get("/posts", validate(adminPostsSchema), controller.posts);
adminRouter.delete(
  "/posts/:id",
  adminMutationRateLimit,
  validate(adminDeletePostSchema),
  controller.deletePost
);
adminRouter.patch(
  "/posts/:id/restore",
  adminMutationRateLimit,
  validate(adminRestorePostSchema),
  controller.restorePost
);
adminRouter.post(
  "/stores",
  adminMutationRateLimit,
  validate(adminCreateStoreSchema),
  controller.createStore
);
adminRouter.patch(
  "/stores/:id",
  adminMutationRateLimit,
  validate(adminUpdateStoreSchema),
  controller.updateStore
);
adminRouter.post(
  "/events",
  adminMutationRateLimit,
  validate(adminCreateEventSchema),
  controller.createEvent
);
adminRouter.patch(
  "/events/:id",
  adminMutationRateLimit,
  validate(adminUpdateEventSchema),
  controller.updateEvent
);
adminRouter.delete(
  "/events/:id",
  adminMutationRateLimit,
  validate(adminIdSchema),
  controller.deleteEvent
);
