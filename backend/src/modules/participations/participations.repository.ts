import type { PrismaClient } from "../../generated/prisma/client.js";
import { prisma } from "../../infrastructure/prisma/client.js";
import { AppError } from "../../common/errors/AppError.js";

const postInclude = {
  writer: {
    select: { id: true, nickname: true, profileImage: true, rating: true, reviewCount: true }
  },
  store: true,
  event: { select: { id: true, title: true } }
} as const;

export class ParticipationsRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  findPost(id: string) {
    return this.db.post.findUnique({
      where: { id },
      select: { id: true, writerId: true, status: true, remainCount: true, deletedAt: true }
    });
  }

  findForUser(userId: string, postId: string) {
    return this.db.participation.findUnique({ where: { userId_postId: { userId, postId } } });
  }

  createAndReserve(userId: string, postId: string, quantity: number, pickupStore: string) {
    return this.db.$transaction(async (tx) => {
      const reserved = await tx.post.updateMany({
        where: { id: postId, deletedAt: null, status: "OPEN", remainCount: { gte: quantity } },
        data: { remainCount: { decrement: quantity } }
      });
      if (reserved.count !== 1) {
        throw new AppError(
          "PARTICIPATION_SOLD_OUT",
          "남은 수량이 부족하거나 마감된 모집입니다.",
          409
        );
      }

      const participation = await tx.participation.create({
        data: { userId, postId, quantity, pickupStore }
      });
      const post = await tx.post.findUniqueOrThrow({ where: { id: postId } });
      if (post.remainCount === 0) {
        await tx.post.update({
          where: { id: postId },
          data: { status: "CLOSED", closedAt: post.closedAt ?? new Date() }
        });
      }
      return tx.participation.findUniqueOrThrow({
        where: { id: participation.id },
        include: { post: { include: postInclude } }
      });
    });
  }

  find(id: string) {
    return this.db.participation.findUnique({
      where: { id },
      include: { post: { select: { status: true } } }
    });
  }

  cancelAndRestore(id: string, quantity: number, postId: string) {
    return this.db.$transaction(async (tx) => {
      const post = await tx.post.findUniqueOrThrow({
        where: { id: postId },
        select: { status: true, remainCount: true }
      });
      const cancelled = await tx.participation.updateMany({
        where: { id, status: "CONFIRMED" },
        data: { status: "CANCELLED", cancelledAt: new Date() }
      });
      if (cancelled.count === 0) {
        return tx.participation.findUniqueOrThrow({ where: { id } });
      }
      await tx.post.update({
        where: { id: postId },
        data: {
          remainCount: { increment: quantity },
          ...(post.status === "CLOSED" && post.remainCount === 0
            ? { status: "OPEN", closedAt: null }
            : {})
        }
      });
      return tx.participation.findUniqueOrThrow({ where: { id } });
    });
  }

  async list(userId: string, page: number, limit: number) {
    const where = { userId };
    const [items, total] = await Promise.all([
      this.db.participation.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { post: { include: postInclude } }
      }),
      this.db.participation.count({ where })
    ]);
    return { items, total };
  }
}
