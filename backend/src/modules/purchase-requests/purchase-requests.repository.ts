import type { Prisma, PrismaClient, PurchaseRequestStatus } from "../../generated/prisma/client.js";
import { prisma } from "../../infrastructure/prisma/client.js";
import { AppError } from "../../common/errors/AppError.js";

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

  create(
    requesterId: string,
    data: Omit<Prisma.PurchaseRequestUncheckedCreateInput, "requesterId">
  ) {
    return this.db.purchaseRequest.create({ data: { ...data, requesterId }, include });
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
      return tx.purchaseRequest.findUniqueOrThrow({ where: { id }, include });
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
