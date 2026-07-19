import type { Request, Response } from "express";
import { ok } from "../../common/types/api.js";
import { UsersService } from "./users.service.js";

export class UsersController {
  constructor(private readonly service = new UsersService()) {}

  get = async (req: Request, res: Response): Promise<void> => {
    res.json(ok(await this.service.get(req.params.id as string)));
  };
  updateMe = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as { nickname: string };
    res.json(ok(await this.service.updateNickname(req.auth!.userId, body.nickname)));
  };
  updateProfileImage = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as { imageData: string };
    res.json(ok(await this.service.updateProfileImage(req.auth!.userId, body.imageData)));
  };
  removeProfileImage = async (req: Request, res: Response): Promise<void> => {
    res.json(ok(await this.service.removeProfileImage(req.auth!.userId)));
  };
  posts = async (req: Request, res: Response): Promise<void> => {
    res.json(
      ok(
        await this.service.posts(
          req.params.id as string,
          Number(req.query.page),
          Number(req.query.limit)
        )
      )
    );
  };
  myPosts = async (req: Request, res: Response): Promise<void> => {
    res.json(
      ok(
        await this.service.myPosts(
          req.auth!.userId,
          Number(req.query.page),
          Number(req.query.limit)
        )
      )
    );
  };
  reviews = async (req: Request, res: Response): Promise<void> => {
    res.json(
      ok(
        await this.service.reviews(
          req.params.id as string,
          Number(req.query.page),
          Number(req.query.limit)
        )
      )
    );
  };
}
