import type { Request, Response } from "express";
import { ok } from "../../common/types/api.js";
import { NotificationsService } from "./notifications.service.js";

export class NotificationsController {
  constructor(private readonly service = new NotificationsService()) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as unknown as { unreadOnly: boolean; page: number; limit: number };
    res.json(
      ok(
        await this.service.list(
          req.auth!.userId,
          query.unreadOnly,
          Number(query.page),
          Number(query.limit)
        )
      )
    );
  };

  markRead = async (req: Request, res: Response): Promise<void> => {
    res.json(ok(await this.service.markRead(req.auth!.userId, req.params.id as string)));
  };

  markAllRead = async (req: Request, res: Response): Promise<void> => {
    res.json(ok(await this.service.markAllRead(req.auth!.userId)));
  };
}
