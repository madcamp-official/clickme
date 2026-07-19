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
  findParticipation(userId: string, postId: string) {
    return this.db.participation.findUnique({
      where: { userId_postId: { userId, postId } },
      select: { status: true }
    });
  }
  createAndRecalculate(input: {
    writerId: string;
    sellerId: string;
    postId: string;
    rating: number;
    content: string;
  }) {
    return this.db.$transaction(async (tx) => {
      // 같은 판매자에게 후기가 동시에 등록되어도 평점 집계가 서로 덮어쓰지 않도록
      // 판매자 단위 transaction advisory lock을 먼저 획득합니다.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.sellerId}))`;
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
  async listWritten(userId: string, page: number, limit: number) {
    const where = { writerId: userId };
    const [items, total] = await Promise.all([
      this.db.review.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          seller: { select: { id: true, nickname: true, profileImage: true } },
          post: {
            include: {
              writer: {
                select: {
                  id: true,
                  nickname: true,
                  profileImage: true,
                  rating: true,
                  reviewCount: true
                }
              },
              store: true,
              event: { select: { id: true, title: true } }
            }
          }
        }
      }),
      this.db.review.count({ where })
    ]);
    return { items, total };
  }
}
