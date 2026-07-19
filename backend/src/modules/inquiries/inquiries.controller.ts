import type { Request, Response } from "express";
import { ok } from "../../common/types/api.js";
import { InquiriesService } from "./inquiries.service.js";
import type { CreateInquiryInput } from "./inquiries.schema.js";

export class InquiriesController {
  constructor(private readonly service = new InquiriesService()) {}

  create = async (req: Request, res: Response): Promise<void> => {
    res
      .status(201)
      .json(ok(await this.service.create(req.auth!.userId, req.body as CreateInquiryInput)));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    res.json(
      ok(await this.service.list(req.auth!.userId, Number(req.query.page), Number(req.query.limit)))
    );
  };
}
