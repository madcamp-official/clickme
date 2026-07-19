import type { InquiryCategory, PrismaClient } from "../../generated/prisma/client.js";
import { prisma } from "../../infrastructure/prisma/client.js";

export class InquiriesRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  create(userId: string, category: InquiryCategory, content: string) {
    return this.db.inquiry.create({ data: { userId, category, content } });
  }

  async list(userId: string, page: number, limit: number) {
    const where = { userId };
    const [items, total] = await Promise.all([
      this.db.inquiry.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" }
      }),
      this.db.inquiry.count({ where })
    ]);
    return { items, total };
  }
}
