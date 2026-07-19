import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate.js";
import { validate } from "../../common/middleware/validate.js";
import { InquiriesController } from "./inquiries.controller.js";
import { createInquirySchema, inquiryListSchema } from "./inquiries.schema.js";

const controller = new InquiriesController();
export const inquiriesRouter = Router();
inquiriesRouter.use(authenticate);
inquiriesRouter.get("/", validate(inquiryListSchema), controller.list);
inquiriesRouter.post("/", validate(createInquirySchema), controller.create);
