import type { Prisma, ReportStatus } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/AppError.js";
import { toPagination } from "../../common/utils/pagination.js";
import { AdminRepository } from "./admin.repository.js";

export class AdminService {
  constructor(private readonly repository = new AdminRepository()) {}
  async reports(status: ReportStatus | undefined, page: number, limit: number) {
    const result = await this.repository.reports(status, page, limit);
    return { items: result.items, pagination: toPagination(page, limit, result.total) };
  }
  async report(id: string) {
    const report = await this.repository.report(id);
    if (!report) throw new AppError("REPORT_NOT_FOUND", "신고를 찾을 수 없습니다.", 404);
    return report;
  }
  async handleReport(id: string, adminId: string, status: ReportStatus, adminNote: string) {
    await this.report(id);
    return this.repository.handleReport(id, adminId, status, adminNote);
  }
  async users(input: {
    status?: "ACTIVE" | "SUSPENDED";
    role?: "USER" | "ADMIN";
    keyword?: string;
    page: number;
    limit: number;
  }) {
    const where: Prisma.UserWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.keyword ? { nickname: { contains: input.keyword, mode: "insensitive" } } : {})
    };
    const result = await this.repository.users(where, input.page, input.limit);
    return { items: result.items, pagination: toPagination(input.page, input.limit, result.total) };
  }
  async suspend(userId: string, adminId: string, reason: string) {
    if (userId === adminId) throw new AppError("FORBIDDEN", "자기 자신을 정지할 수 없습니다.", 400);
    if (!(await this.repository.findUser(userId)))
      throw new AppError("USER_NOT_FOUND", "사용자를 찾을 수 없습니다.", 404);
    return this.repository.suspend(userId, adminId, reason);
  }
  async unsuspend(userId: string, adminId: string, reason?: string) {
    if (!(await this.repository.findUser(userId)))
      throw new AppError("USER_NOT_FOUND", "사용자를 찾을 수 없습니다.", 404);
    return this.repository.unsuspend(userId, adminId, reason);
  }
  async posts(deleted: boolean | undefined, page: number, limit: number) {
    const result = await this.repository.posts(deleted, page, limit);
    return { items: result.items, pagination: toPagination(page, limit, result.total) };
  }
  async deletePost(id: string, adminId: string, reason: string) {
    if (!(await this.repository.findPost(id)))
      throw new AppError("POST_NOT_FOUND", "모집글을 찾을 수 없습니다.", 404);
    return this.repository.setPostDeleted(id, adminId, true, reason);
  }
  async restorePost(id: string, adminId: string, reason?: string) {
    if (!(await this.repository.findPost(id)))
      throw new AppError("POST_NOT_FOUND", "모집글을 찾을 수 없습니다.", 404);
    return this.repository.setPostDeleted(id, adminId, false, reason);
  }
  createStore(data: Prisma.StoreCreateInput, adminId: string) {
    return this.repository.createStore(data, adminId);
  }
  updateStore(id: string, data: Prisma.StoreUpdateInput, adminId: string) {
    return this.repository.updateStore(id, data, adminId);
  }
  createEvent(data: Prisma.EventCreateInput, adminId: string) {
    return this.repository.createEvent(data, adminId);
  }
  async updateEvent(id: string, data: Prisma.EventUpdateInput, adminId: string) {
    const current = await this.repository.findEvent(id);
    if (!current) throw new AppError("EVENT_NOT_FOUND", "이벤트를 찾을 수 없습니다.", 404);
    const startDate = data.startDate instanceof Date ? data.startDate : current.startDate;
    const endDate = data.endDate instanceof Date ? data.endDate : current.endDate;
    if (startDate >= endDate) {
      throw new AppError("VALIDATION_ERROR", "이벤트 종료일은 시작일보다 늦어야 합니다.", 400);
    }
    return this.repository.updateEvent(id, data, adminId);
  }
  async deleteEvent(id: string, adminId: string) {
    if (!(await this.repository.findEvent(id))) {
      throw new AppError("EVENT_NOT_FOUND", "이벤트를 찾을 수 없습니다.", 404);
    }
    return this.repository.deleteEvent(id, adminId);
  }
}
