import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { prisma } from "../../infrastructure/prisma/client.js";

const listInclude = {
  writer: {
    select: { id: true, nickname: true, profileImage: true, rating: true, reviewCount: true }
  },
  store: true,
  event: { select: { id: true, title: true } }
} satisfies Prisma.PostInclude;

export class PostsRepository {
  constructor(private readonly db: PrismaClient = prisma) {}
  async list(
    where: Prisma.PostWhereInput,
    orderBy: Prisma.PostOrderByWithRelationInput,
    page: number,
    limit: number
  ) {
    const [rows, total] = await Promise.all([
      this.db.post.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: listInclude,
        omit: { openChatUrl: true }
      }),
      this.db.post.count({ where })
    ]);
    return { items: rows, total };
  }
  find(id: string) {
    return this.db.post.findUnique({ where: { id }, include: listInclude });
  }
  create(data: Prisma.PostUncheckedCreateInput) {
    return this.db.post.create({ data, include: listInclude });
  }
  update(id: string, data: Prisma.PostUpdateInput) {
    return this.db.post.update({ where: { id }, data, include: listInclude });
  }
}
