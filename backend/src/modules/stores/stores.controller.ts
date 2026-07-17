import type { Request, Response } from "express";
import { ok } from "../../common/types/api.js";
import { StoresService } from "./stores.service.js";

export class StoresController {
  constructor(private readonly service = new StoresService()) {}
  list = async (req: Request, res: Response): Promise<void> => {
    const { region, keyword } = req.query;
    res.json(
      ok(
        await this.service.list({
          ...(typeof region === "string" ? { region } : {}),
          ...(typeof keyword === "string" ? { keyword } : {}),
          page: Number(req.query.page),
          limit: Number(req.query.limit)
        })
      )
    );
  };
  get = async (req: Request, res: Response): Promise<void> => {
    res.json(ok(await this.service.get(req.params.id as string)));
  };
}
