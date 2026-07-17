import type { PrismaClient } from "../../generated/prisma/client.js";
import { prisma } from "../../infrastructure/prisma/client.js";

export class FavoritesRepository {
  constructor(private readonly db: PrismaClient = prisma) {}
  findPost(id: string) {
    return this.db.post.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
  }
  add(userId: string, postId: string) {
    return this.db.favorite.upsert({
      where: { userId_postId: { userId, postId } },
      create: { userId, postId },
      update: {}
    });
  }
  async remove(userId: string, postId: string): Promise<void> {
    await this.db.favorite.deleteMany({ where: { userId, postId } });
  }
  async list(userId: string, page: number, limit: number) {
    const where = { userId, post: { deletedAt: null } };
    const [rows, total] = await Promise.all([
      this.db.favorite.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          post: {
            omit: { openChatUrl: true },
            include: {
              store: true,
              writer: { select: { id: true, nickname: true, profileImage: true } }
            }
          }
        }
      }),
      this.db.favorite.count({ where })
    ]);
    return { items: rows, total };
  }
}
