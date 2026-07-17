import type { Request, Response } from "express";
import { ok } from "../../common/types/api.js";
import { HealthService } from "./health.service.js";

export class HealthController {
  constructor(private readonly service = new HealthService()) {}
  get = async (_req: Request, res: Response): Promise<void> => {
    res.json(ok(await this.service.check()));
  };
}
