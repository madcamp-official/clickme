import type { Prisma, PrismaClient, PurchaseRequestStatus } from "../../generated/prisma/client.js";
import { prisma } from "../../infrastructure/prisma/client.js";
import { AppError } from "../../common/errors/AppError.js";
import { NCT_WISH_EVENT_MENU_CATALOG_NAMES } from "../menus/nct-wish-event-menus.js";

const include = {
  requester: { select: { id: true, nickname: true, profileImage: true } },
  accepter: { select: { id: true, nickname: true, profileImage: true } }
} as const;

export class PurchaseRequestsRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list(where: Prisma.PurchaseRequestWhereInput, page: number, limit: number) {
    const [items, total] = await Promise.all([
      this.db.purchaseRequest.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include,
        omit: { openChatUrl: true }
      }),
      this.db.purchaseRequest.count({ where })
    ]);
    return { items, total };
  }

  find(id: string) {
    return this.db.purchaseRequest.findUnique({ where: { id }, include });
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

  create(
    requesterId: string,
    data: Omit<Prisma.PurchaseRequestUncheckedCreateInput, "requesterId">
  ) {
    return this.db.purchaseRequest.create({ data: { ...data, requesterId }, include });
  }

  updateOpen(
    id: string,
    requesterId: string,
    data: Prisma.PurchaseRequestUncheckedUpdateManyInput
  ) {
    return this.db.$transaction(async (tx) => {
      const updated = await tx.purchaseRequest.updateMany({
        where: { id, requesterId, status: "OPEN" },
        data
      });
      if (updated.count !== 1)
        throw new AppError(
          "PURCHASE_REQUEST_ALREADY_ACCEPTED",
          "수락된 요청은 수정할 수 없습니다.",
          409
        );
      return tx.purchaseRequest.findUniqueOrThrow({ where: { id }, include });
    });
  }

  accept(id: string, accepterId: string) {
    return this.db.$transaction(async (tx) => {
      const accepted = await tx.purchaseRequest.updateMany({
        where: { id, status: "OPEN", accepterId: null },
        data: { status: "ACCEPTED", accepterId, acceptedAt: new Date() }
      });
      if (accepted.count !== 1)
        throw new AppError(
          "PURCHASE_REQUEST_ALREADY_ACCEPTED",
          "이미 수락되었거나 마감된 요청입니다.",
          409
        );
      const request = await tx.purchaseRequest.findUniqueOrThrow({ where: { id }, include });
      await tx.notification.create({
        data: {
          recipientId: request.requesterId,
          actorId: accepterId,
          type: "PURCHASE_REQUEST_ACCEPTED",
          title: "구매 요청이 수락됐어요",
          message: `${request.accepter?.nickname ?? "다른 사용자"}님이 ${request.menu} ${request.quantity}잔 요청을 수락했습니다.`,
          resourceType: "PurchaseRequest",
          resourceId: request.id
        }
      });
      return request;
    });
  }

  setStatus(id: string, status: PurchaseRequestStatus) {
    return this.db.purchaseRequest.update({
      where: { id },
      data: { status, ...(status === "CANCELLED" ? { cancelledAt: new Date() } : {}) },
      include
    });
  }
}
