import type { Request, Response } from "express";
import { ok } from "../../common/types/api.js";
import { ParticipationsService } from "./participations.service.js";
import type { CreateParticipationInput } from "./participations.schema.js";

export class ParticipationsController {
  constructor(private readonly service = new ParticipationsService()) {}

  create = async (req: Request, res: Response): Promise<void> => {
    res
      .status(201)
      .json(
        ok(
          await this.service.create(
            req.auth!.userId,
            req.params.postId as string,
            req.body as CreateParticipationInput
          )
        )
      );
  };

  cancel = async (req: Request, res: Response): Promise<void> => {
    res.json(ok(await this.service.cancel(req.auth!.userId, req.params.id as string)));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    res.json(
      ok(await this.service.list(req.auth!.userId, Number(req.query.page), Number(req.query.limit)))
    );
  };
}
