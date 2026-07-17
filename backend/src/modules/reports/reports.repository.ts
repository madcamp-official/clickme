import type { PrismaClient, ReportReason } from "../../generated/prisma/client.js";
import { prisma } from "../../infrastructure/prisma/client.js";

export class ReportsRepository {
  constructor(private readonly db: PrismaClient = prisma) {}
  findPost(id: string) {
    return this.db.post.findUnique({
      where: { id },
      select: { id: true, writerId: true, deletedAt: true }
    });
  }
  findExisting(reporterId: string, targetPostId: string, reason: ReportReason) {
    return this.db.report.findUnique({
      where: { reporterId_targetPostId_reason: { reporterId, targetPostId, reason } }
    });
  }
  create(data: {
    reporterId: string;
    targetPostId: string;
    reason: ReportReason;
    detail?: string;
  }) {
    return this.db.report.create({ data });
  }
}
