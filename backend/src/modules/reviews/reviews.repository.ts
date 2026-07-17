import type { PrismaClient } from "../../generated/prisma/client.js";
import { prisma } from "../../infrastructure/prisma/client.js";

export class ReviewsRepository {
  constructor(private readonly db: PrismaClient = prisma) {}
  findPost(id: string) {
    return this.db.post.findUnique({ where: { id } });
  }
  findExisting(writerId: string, postId: string) {
    return this.db.review.findUnique({ where: { writerId_postId: { writerId, postId } } });
  }
  createAndRecalculate(input: {
    writerId: string;
    sellerId: string;
    postId: string;
    rating: number;
    content: string;
  }) {
    return this.db.$transaction(async (tx) => {
      const review = await tx.review.create({ data: input });
      const aggregate = await tx.review.aggregate({
        where: { sellerId: input.sellerId },
        _avg: { rating: true },
        _count: { rating: true }
      });
      await tx.user.update({
        where: { id: input.sellerId },
        data: { rating: aggregate._avg.rating ?? 0, reviewCount: aggregate._count.rating }
      });
      return review;
    });
  }
  async list(userId: string, page: number, limit: number) {
    const where = { sellerId: userId };
    const [items, total] = await Promise.all([
      this.db.review.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { writer: { select: { id: true, nickname: true, profileImage: true } } }
      }),
      this.db.review.count({ where })
    ]);
    return { items, total };
  }
}
