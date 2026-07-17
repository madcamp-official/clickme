import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { prisma } from "../../infrastructure/prisma/client.js";

const publicUserSelect = {
  id: true,
  nickname: true,
  profileImage: true,
  rating: true,
  reviewCount: true,
  createdAt: true
} satisfies Prisma.UserSelect;

export class UsersRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  findPublic(id: string) {
    return this.db.user.findFirst({ where: { id, deletedAt: null }, select: publicUserSelect });
  }

  findNickname(nickname: string) {
    return this.db.user.findUnique({ where: { nickname }, select: { id: true } });
  }

  updateNickname(id: string, nickname: string) {
    return this.db.user.update({ where: { id }, data: { nickname }, select: publicUserSelect });
  }

  async posts(userId: string, page: number, limit: number) {
    const where: Prisma.PostWhereInput = { writerId: userId, deletedAt: null };
    const [items, total] = await Promise.all([
      this.db.post.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        omit: { openChatUrl: true }
      }),
      this.db.post.count({ where })
    ]);
    return { items, total };
  }

  async reviews(userId: string, page: number, limit: number) {
    const where: Prisma.ReviewWhereInput = { sellerId: userId };
    const [items, total] = await Promise.all([
      this.db.review.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          writer: { select: publicUserSelect },
          post: { select: { id: true, meetingPlace: true } }
        }
      }),
      this.db.review.count({ where })
    ]);
    return { items, total };
  }
}
