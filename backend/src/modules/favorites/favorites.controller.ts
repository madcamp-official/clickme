import type { Request, Response } from "express";
import { ok } from "../../common/types/api.js";
import { FavoritesService } from "./favorites.service.js";

export class FavoritesController {
  constructor(private readonly service = new FavoritesService()) {}
  add = async (req: Request, res: Response): Promise<void> => {
    res.status(201).json(ok(await this.service.add(req.auth!.userId, req.params.postId as string)));
  };
  remove = async (req: Request, res: Response): Promise<void> => {
    await this.service.remove(req.auth!.userId, req.params.postId as string);
    res.status(204).end();
  };
  list = async (req: Request, res: Response): Promise<void> => {
    res.json(
      ok(await this.service.list(req.auth!.userId, Number(req.query.page), Number(req.query.limit)))
    );
  };
}
