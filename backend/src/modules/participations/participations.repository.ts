import type { PrismaClient } from "../../generated/prisma/client.js";
import { prisma } from "../../infrastructure/prisma/client.js";
import { AppError } from "../../common/errors/AppError.js";
import { NCT_WISH_EVENT_MENU_CATALOG_NAMES } from "../menus/nct-wish-event-menus.js";

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

  async findSelection(storeId: string, menuId: string) {
    const [store, menu] = await Promise.all([
      this.db.store.findFirst({ where: { id: storeId, isActive: true } }),
      this.db.menu.findFirst({
        where: {
          id: menuId,
          isActive: true,
          name: { in: [...NCT_WISH_EVENT_MENU_CATALOG_NAMES] },
          storeMenus: { none: { storeId, availability: "UNAVAILABLE" } }
        }
      })
    ]);
    return { store, menu };
  }

  createAndReserve(
    userId: string,
    postId: string,
    quantity: number,
    selection: { pickupStoreId: string; pickupStore: string; menuId: string; menu: string }
  ) {
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
        data: { userId, postId, quantity, ...selection }
      });
      const post = await tx.post.findUniqueOrThrow({ where: { id: postId } });
      const participant = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { nickname: true }
      });
      await tx.notification.create({
        data: {
          recipientId: post.writerId,
          actorId: userId,
          type: "PARTICIPATION_CREATED",
          title: "새 참여 신청이 도착했어요",
          message: `${participant.nickname}님이 ${selection.menu} ${quantity}잔 참여를 신청했습니다. 픽업 매장은 ${selection.pickupStore}입니다.`,
          resourceType: "Post",
          resourceId: postId
        }
      });
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
