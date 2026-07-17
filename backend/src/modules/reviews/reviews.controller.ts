import type { Request, Response } from "express";
import { ok } from "../../common/types/api.js";
import { ReviewsService } from "./reviews.service.js";

export class ReviewsController {
  constructor(private readonly service = new ReviewsService()) {}
  create = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as { postId: string; rating: number; content: string };
    res.status(201).json(ok(await this.service.create(req.auth!.userId, body)));
  };
  list = async (req: Request, res: Response): Promise<void> => {
    res.json(
      ok(
        await this.service.list(
          req.params.userId as string,
          Number(req.query.page),
          Number(req.query.limit)
        )
      )
    );
  };
}
