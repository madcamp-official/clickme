import type { Request, Response } from "express";
import { ok } from "../../common/types/api.js";
import { EventsService } from "./events.service.js";

export class EventsController {
  constructor(private readonly service = new EventsService()) {}
  list = async (req: Request, res: Response): Promise<void> => {
    const active = typeof req.query.active === "boolean" ? req.query.active : undefined;
    res.json(ok(await this.service.list(active, Number(req.query.page), Number(req.query.limit))));
  };
  get = async (req: Request, res: Response): Promise<void> => {
    res.json(ok(await this.service.get(req.params.id as string)));
  };
}
