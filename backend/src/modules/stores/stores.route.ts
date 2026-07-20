import { Router } from "express";
import { validate } from "../../common/middleware/validate.js";
import { StoresController } from "./stores.controller.js";
import { storeIdSchema, storeListSchema, storeMenuListSchema } from "./stores.schema.js";

const controller = new StoresController();
export const storesRouter = Router();
storesRouter.get("/", validate(storeListSchema), controller.list);
storesRouter.get("/regions", controller.regions);
storesRouter.get("/:id/menus", validate(storeMenuListSchema), controller.menus);
storesRouter.get("/:id", validate(storeIdSchema), controller.get);
