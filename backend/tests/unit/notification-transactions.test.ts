import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { ParticipationsRepository } from "../../src/modules/participations/participations.repository.js";
import { PurchaseRequestsRepository } from "../../src/modules/purchase-requests/purchase-requests.repository.js";

describe("transactional notifications", () => {
  it("creates a requester notification in the same transaction as purchase request acceptance", async () => {
    const notificationCreate = vi.fn().mockResolvedValue({ id: "notification-1" });
    const request = {
      id: "request-1",
      requesterId: "requester",
      accepterId: "accepter",
      menu: "골드망고 스무디",
      quantity: 2,
      accepter: { id: "accepter", nickname: "수락자", profileImage: null }
    };
    const tx = {
      purchaseRequest: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(request)
      },
      notification: { create: notificationCreate }
    };
    const db = {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx))
    } as unknown as PrismaClient;

    await new PurchaseRequestsRepository(db).accept("request-1", "accepter");

    const notificationInput = notificationCreate.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(notificationInput.data).toMatchObject({
      recipientId: "requester",
      actorId: "accepter",
      type: "PURCHASE_REQUEST_ACCEPTED",
      resourceId: "request-1"
    });
  });

  it("notifies the post writer when another user participates", async () => {
    const notificationCreate = vi.fn().mockResolvedValue({ id: "notification-2" });
    const participation = {
      id: "participation-1",
      userId: "buyer",
      postId: "post-1",
      quantity: 1,
      pickupStore: "홍대점"
    };
    const tx = {
      post: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "post-1",
          writerId: "seller",
          remainCount: 2,
          closedAt: null
        }),
        update: vi.fn()
      },
      participation: {
        create: vi.fn().mockResolvedValue(participation),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ ...participation, post: {} })
      },
      user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ nickname: "참여자" }) },
      notification: { create: notificationCreate }
    };
    const db = {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx))
    } as unknown as PrismaClient;

    await new ParticipationsRepository(db).createAndReserve("buyer", "post-1", 1, {
      pickupStoreId: "store-1",
      pickupStore: "홍대점",
      menuId: "menu-1",
      menu: "골드망고 스무디"
    });

    const notificationInput = notificationCreate.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(notificationInput.data).toMatchObject({
      recipientId: "seller",
      actorId: "buyer",
      type: "PARTICIPATION_CREATED",
      resourceType: "Post",
      resourceId: "post-1"
    });
  });
});
