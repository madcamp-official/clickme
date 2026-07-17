import type { Request, Response } from "express";
import { ok } from "../../common/types/api.js";
import { ReportsService } from "./reports.service.js";
import type { ReportReason } from "../../generated/prisma/client.js";

export class ReportsController {
  constructor(private readonly service = new ReportsService()) {}
  create = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as { targetPostId: string; reason: ReportReason; detail?: string };
    res.status(201).json(ok(await this.service.create(req.auth!.userId, body)));
  };
}
