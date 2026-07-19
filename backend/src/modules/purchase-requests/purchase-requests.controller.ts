import type { Request, Response } from "express";
import { ok } from "../../common/types/api.js";
import { PurchaseRequestsService } from "./purchase-requests.service.js";
import type {
  CreatePurchaseRequestInput,
  PurchaseRequestListInput
} from "./purchase-requests.schema.js";

export class PurchaseRequestsController {
  constructor(private readonly service = new PurchaseRequestsService()) {}

  list = async (req: Request, res: Response): Promise<void> => {
    res.json(ok(await this.service.list(req.query as unknown as PurchaseRequestListInput)));
  };
  get = async (req: Request, res: Response): Promise<void> => {
    res.json(ok(await this.service.get(req.params.id as string, req.auth!.userId)));
  };
  create = async (req: Request, res: Response): Promise<void> => {
    res
      .status(201)
      .json(
        ok(await this.service.create(req.auth!.userId, req.body as CreatePurchaseRequestInput))
      );
  };
  accept = async (req: Request, res: Response): Promise<void> => {
    res.json(ok(await this.service.accept(req.params.id as string, req.auth!.userId)));
  };
  cancel = async (req: Request, res: Response): Promise<void> => {
    res.json(ok(await this.service.cancel(req.params.id as string, req.auth!.userId)));
  };
}
