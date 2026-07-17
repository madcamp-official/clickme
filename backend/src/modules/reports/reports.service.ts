import type { ReportReason } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/AppError.js";
import { ReportsRepository } from "./reports.repository.js";

export class ReportsService {
  constructor(private readonly repository = new ReportsRepository()) {}
  async create(
    reporterId: string,
    input: { targetPostId: string; reason: ReportReason; detail?: string }
  ) {
    const post = await this.repository.findPost(input.targetPostId);
    if (!post || post.deletedAt)
      throw new AppError("POST_NOT_FOUND", "모집글을 찾을 수 없습니다.", 404);
    if (post.writerId === reporterId)
      throw new AppError("SELF_REPORT_NOT_ALLOWED", "자기 글은 신고할 수 없습니다.", 400);
    if (await this.repository.findExisting(reporterId, input.targetPostId, input.reason)) {
      throw new AppError("REPORT_ALREADY_EXISTS", "이미 같은 사유로 신고했습니다.", 409);
    }
    return this.repository.create({ reporterId, ...input });
  }
}
