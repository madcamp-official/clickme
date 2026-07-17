import type { Request, Response } from "express";
import type { Prisma, ReportStatus } from "../../generated/prisma/client.js";
import { ok } from "../../common/types/api.js";
import { AdminService } from "./admin.service.js";

export class AdminController {
  constructor(private readonly service = new AdminService()) {}
  reports = async (req: Request, res: Response): Promise<void> => {
    res.json(
      ok(
        await this.service.reports(
          req.query.status as ReportStatus | undefined,
          Number(req.query.page),
          Number(req.query.limit)
        )
      )
    );
  };
  report = async (req: Request, res: Response): Promise<void> => {
    res.json(ok(await this.service.report(req.params.id as string)));
  };
  handleReport = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as { status: ReportStatus; adminNote: string };
    res.json(
      ok(
        await this.service.handleReport(
          req.params.id as string,
          req.auth!.userId,
          body.status,
          body.adminNote
        )
      )
    );
  };
  users = async (req: Request, res: Response): Promise<void> => {
    const { status, role, keyword } = req.query;
    res.json(
      ok(
        await this.service.users({
          ...(typeof status === "string" ? { status: status as "ACTIVE" | "SUSPENDED" } : {}),
          ...(typeof role === "string" ? { role: role as "USER" | "ADMIN" } : {}),
          ...(typeof keyword === "string" ? { keyword } : {}),
          page: Number(req.query.page),
          limit: Number(req.query.limit)
        })
      )
    );
  };
  suspend = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as { reason: string };
    res.json(
      ok(await this.service.suspend(req.params.id as string, req.auth!.userId, body.reason))
    );
  };
  unsuspend = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as { reason?: string };
    res.json(
      ok(await this.service.unsuspend(req.params.id as string, req.auth!.userId, body.reason))
    );
  };
  posts = async (req: Request, res: Response): Promise<void> => {
    const deleted = typeof req.query.deleted === "boolean" ? req.query.deleted : undefined;
    res.json(
      ok(await this.service.posts(deleted, Number(req.query.page), Number(req.query.limit)))
    );
  };
  deletePost = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as { reason: string };
    res.json(
      ok(await this.service.deletePost(req.params.id as string, req.auth!.userId, body.reason))
    );
  };
  restorePost = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as { reason?: string };
    res.json(
      ok(await this.service.restorePost(req.params.id as string, req.auth!.userId, body.reason))
    );
  };
  createStore = async (req: Request, res: Response): Promise<void> => {
    res
      .status(201)
      .json(
        ok(await this.service.createStore(req.body as Prisma.StoreCreateInput, req.auth!.userId))
      );
  };
  updateStore = async (req: Request, res: Response): Promise<void> => {
    res.json(
      ok(
        await this.service.updateStore(
          req.params.id as string,
          req.body as Prisma.StoreUpdateInput,
          req.auth!.userId
        )
      )
    );
  };
  createEvent = async (req: Request, res: Response): Promise<void> => {
    res
      .status(201)
      .json(
        ok(await this.service.createEvent(req.body as Prisma.EventCreateInput, req.auth!.userId))
      );
  };
  updateEvent = async (req: Request, res: Response): Promise<void> => {
    res.json(
      ok(
        await this.service.updateEvent(
          req.params.id as string,
          req.body as Prisma.EventUpdateInput,
          req.auth!.userId
        )
      )
    );
  };
  deleteEvent = async (req: Request, res: Response): Promise<void> => {
    await this.service.deleteEvent(req.params.id as string, req.auth!.userId);
    res.status(204).end();
  };
}
