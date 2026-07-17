import type { Request, Response } from "express";
import { ok } from "../../common/types/api.js";
import { PostsService } from "./posts.service.js";
import type { CreatePostInput, PostListInput, UpdatePostInput } from "./posts.schema.js";

export class PostsController {
  constructor(private readonly service = new PostsService()) {}
  list = async (req: Request, res: Response): Promise<void> => {
    res.json(ok(await this.service.list(req.query as unknown as PostListInput)));
  };
  get = async (req: Request, res: Response): Promise<void> => {
    const actor = req.auth ? { userId: req.auth.userId, role: req.auth.role } : undefined;
    res.json(ok(await this.service.get(req.params.id as string, actor)));
  };
  create = async (req: Request, res: Response): Promise<void> => {
    res
      .status(201)
      .json(ok(await this.service.create(req.auth!.userId, req.body as CreatePostInput)));
  };
  update = async (req: Request, res: Response): Promise<void> => {
    res.json(
      ok(await this.service.update(req.params.id as string, req.auth!, req.body as UpdatePostInput))
    );
  };
  close = async (req: Request, res: Response): Promise<void> => {
    res.json(ok(await this.service.close(req.params.id as string, req.auth!)));
  };
  remain = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as { remainCount: number };
    res.json(
      ok(await this.service.updateRemain(req.params.id as string, req.auth!, body.remainCount))
    );
  };
  delete = async (req: Request, res: Response): Promise<void> => {
    await this.service.delete(req.params.id as string, req.auth!);
    res.status(204).end();
  };
}
