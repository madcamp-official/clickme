import { describe, expect, it, vi } from "vitest";
import type { AdminRepository } from "../../src/modules/admin/admin.repository.js";
import { AdminService } from "../../src/modules/admin/admin.service.js";
import type { EventsRepository } from "../../src/modules/events/events.repository.js";
import type { FavoritesRepository } from "../../src/modules/favorites/favorites.repository.js";
import { FavoritesService } from "../../src/modules/favorites/favorites.service.js";
import type { PostsRepository } from "../../src/modules/posts/posts.repository.js";
import { PostsService } from "../../src/modules/posts/posts.service.js";
import type { ParticipationsRepository } from "../../src/modules/participations/participations.repository.js";
import { ParticipationsService } from "../../src/modules/participations/participations.service.js";
import type { PurchaseRequestsRepository } from "../../src/modules/purchase-requests/purchase-requests.repository.js";
import { PurchaseRequestsService } from "../../src/modules/purchase-requests/purchase-requests.service.js";
import type { ReportsRepository } from "../../src/modules/reports/reports.repository.js";
import { ReportsService } from "../../src/modules/reports/reports.service.js";
import type { ReviewsRepository } from "../../src/modules/reviews/reviews.repository.js";
import { ReviewsService } from "../../src/modules/reviews/reviews.service.js";
import type { StoresRepository } from "../../src/modules/stores/stores.repository.js";
import type { ImageStorage } from "../../src/common/utils/managedImageStorage.js";

const basePost = {
  id: "post-1",
  writerId: "seller",
  storeId: "store",
  eventId: null,
  discount: 20,
  totalCount: 5,
  remainCount: 5,
  meetingTime: new Date(Date.now() + 60_000),
  availableUntil: null,
  meetingPlace: "강남역",
  openChatUrl: "https://open.kakao.com/o/test",
  description: null,
  imageUrl: null,
  status: "OPEN" as const,
  closedAt: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  writer: {},
  store: {},
  event: null
};

describe("domain services", () => {
  it("rejects a past meeting and closes automatically at zero remain count", async () => {
    const update = vi.fn().mockResolvedValue({ ...basePost, remainCount: 0, status: "CLOSED" });
    const posts = {
      find: vi.fn().mockResolvedValue(basePost),
      update
    } as unknown as PostsRepository;
    const stores = {
      find: vi.fn().mockResolvedValue({ id: "store" })
    } as unknown as StoresRepository;
    const events = { find: vi.fn() } as unknown as EventsRepository;
    const service = new PostsService(posts, stores, events);
    await expect(
      service.create("writer", {
        storeId: "store",
        discount: 20,
        totalCount: 5,
        remainCount: 5,
        meetingTime: new Date(Date.now() - 1_000),
        meetingPlace: "강남역",
        openChatUrl: "https://open.kakao.com/o/test"
      })
    ).rejects.toMatchObject({ code: "INVALID_MEETING_TIME" });
    await service.updateRemain("post-1", { userId: "seller", role: "USER" }, 0);
    expect(update).toHaveBeenCalledWith(
      "post-1",
      expect.objectContaining({ remainCount: 0, status: "CLOSED" })
    );
  });

  it("blocks a non-owner from changing a post", async () => {
    const posts = { find: vi.fn().mockResolvedValue(basePost) } as unknown as PostsRepository;
    const service = new PostsService(posts, {} as StoresRepository, {} as EventsRepository);
    await expect(service.close("post-1", { userId: "other", role: "USER" })).rejects.toMatchObject({
      code: "POST_FORBIDDEN"
    });
  });

  it("stores an attached post image without passing image data to Prisma", async () => {
    const create = vi.fn().mockResolvedValue({
      ...basePost,
      imageUrl: "https://wishmatch.test/api/v1/uploads/posts/new.jpg"
    });
    const posts = { create } as unknown as PostsRepository;
    const stores = {
      find: vi.fn().mockResolvedValue({ id: "store" })
    } as unknown as StoresRepository;
    const saveImage = vi
      .fn()
      .mockResolvedValue("https://wishmatch.test/api/v1/uploads/posts/new.jpg");
    const removeImage = vi.fn().mockResolvedValue(undefined);
    const images = { save: saveImage, remove: removeImage } as unknown as ImageStorage;
    await new PostsService(posts, stores, {} as EventsRepository, images).create("seller", {
      storeId: "store",
      discount: 20,
      totalCount: 5,
      remainCount: 5,
      meetingTime: new Date(Date.now() + 60_000),
      meetingPlace: "강남역",
      openChatUrl: "https://open.kakao.com/o/test",
      imageData: "data:image/jpeg;base64,/9j/2Q=="
    });
    expect(saveImage).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: "https://wishmatch.test/api/v1/uploads/posts/new.jpg"
      })
    );
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("imageData");
  });

  it("removes replaced and deleted managed post images", async () => {
    const oldImage = "https://wishmatch.test/api/v1/uploads/posts/old.jpg";
    const newImage = "https://wishmatch.test/api/v1/uploads/posts/new.jpg";
    const update = vi
      .fn()
      .mockResolvedValueOnce({ ...basePost, imageUrl: newImage })
      .mockResolvedValueOnce({ ...basePost, imageUrl: null, deletedAt: new Date() });
    const posts = {
      find: vi.fn().mockResolvedValue({ ...basePost, imageUrl: oldImage }),
      update
    } as unknown as PostsRepository;
    const stores = {
      find: vi.fn().mockResolvedValue({ id: "store" })
    } as unknown as StoresRepository;
    const saveImage = vi.fn().mockResolvedValue(newImage);
    const removeImage = vi.fn().mockResolvedValue(undefined);
    const images = { save: saveImage, remove: removeImage } as unknown as ImageStorage;
    const service = new PostsService(posts, stores, {} as EventsRepository, images);

    await service.update(
      "post-1",
      { userId: "seller", role: "USER" },
      {
        imageData: "data:image/jpeg;base64,/9j/2Q=="
      }
    );
    expect(update).toHaveBeenNthCalledWith(
      1,
      "post-1",
      expect.objectContaining({ imageUrl: newImage })
    );
    expect(update.mock.calls[0]?.[1]).not.toHaveProperty("imageData");
    expect(removeImage).toHaveBeenCalledWith(oldImage);

    await service.delete("post-1", { userId: "seller", role: "USER" });
    const deleteData = update.mock.calls[1]?.[1] as unknown;
    expect(deleteData).toMatchObject({ imageUrl: null });
    expect((deleteData as { deletedAt: unknown }).deletedAt).toBeInstanceOf(Date);
    expect(removeImage).toHaveBeenLastCalledWith(oldImage);
  });

  it("enforces closed, non-self, unique reviews and delegates the rating transaction", async () => {
    const transaction = vi.fn().mockResolvedValue({ id: "review" });
    const reviews = {
      findPost: vi.fn().mockResolvedValue({ ...basePost, status: "CLOSED" }),
      findExisting: vi.fn().mockResolvedValue(null),
      findParticipation: vi.fn().mockResolvedValue({ status: "CONFIRMED" }),
      createAndRecalculate: transaction
    } as unknown as ReviewsRepository;
    await new ReviewsService(reviews).create("buyer", {
      postId: "post-1",
      rating: 5,
      content: "약속을 잘 지켜주셨어요."
    });
    expect(transaction).toHaveBeenCalledWith(
      expect.objectContaining({ sellerId: "seller", writerId: "buyer" })
    );
  });

  it("reserves a participation only for another user's open post", async () => {
    const createAndReserve = vi.fn().mockResolvedValue({ id: "participation" });
    const repository = {
      findPost: vi.fn().mockResolvedValue({
        id: "post-1",
        writerId: "seller",
        status: "OPEN",
        remainCount: 2,
        deletedAt: null
      }),
      findForUser: vi.fn().mockResolvedValue(null),
      findSelection: vi.fn().mockResolvedValue({
        store: { id: "store", name: "강남점" },
        menu: { id: "menu", name: "골드망고스무디" }
      }),
      createAndReserve
    } as unknown as ParticipationsRepository;
    await new ParticipationsService(repository).create("buyer", "post-1", {
      quantity: 2,
      pickupStoreId: "store",
      menuId: "menu"
    });
    expect(createAndReserve).toHaveBeenCalledWith("buyer", "post-1", 2, {
      pickupStoreId: "store",
      pickupStore: "강남점",
      menuId: "menu",
      menu: "골드망고 스무디"
    });
  });

  it("does not cancel a participation after its post has closed", async () => {
    const repository = {
      find: vi.fn().mockResolvedValue({
        id: "participation-1",
        userId: "buyer",
        postId: "post-1",
        quantity: 1,
        status: "CONFIRMED",
        post: { status: "CLOSED" }
      }),
      cancelAndRestore: vi.fn()
    } as unknown as ParticipationsRepository;

    await expect(
      new ParticipationsService(repository).cancel("buyer", "participation-1")
    ).rejects.toMatchObject({ code: "PARTICIPATION_CANCELLATION_CLOSED" });
  });

  it("prevents self-acceptance of a purchase request", async () => {
    const repository = {
      find: vi.fn().mockResolvedValue({
        id: "request-1",
        requesterId: "requester",
        status: "OPEN"
      })
    } as unknown as PurchaseRequestsRepository;
    await expect(
      new PurchaseRequestsService(repository).accept("request-1", "requester")
    ).rejects.toMatchObject({ code: "SELF_ACCEPT_NOT_ALLOWED" });
  });

  it("creates a purchase request from an available store menu and stores snapshots", async () => {
    const create = vi.fn().mockResolvedValue({ id: "request-1" });
    const repository = {
      findSelection: vi.fn().mockResolvedValue({
        store: { id: "store", region: "서울", name: "홍대점" },
        menu: { id: "menu", name: "골드망고스무디", variant: "ICE" }
      }),
      create
    } as unknown as PurchaseRequestsRepository;

    await new PurchaseRequestsService(repository).create("requester", {
      storeId: "store",
      menuId: "menu",
      quantity: 2,
      desiredTime: "2030.01.01 15:00 ~ 18:00",
      openChatUrl: "https://open.kakao.com/o/example"
    });

    expect(create).toHaveBeenCalledWith(
      "requester",
      expect.objectContaining({
        storeId: "store",
        menuId: "menu",
        city: "서울",
        branch: "홍대점",
        menu: "골드망고 스무디"
      })
    );
  });

  it("rejects a menu disabled for the selected store", async () => {
    const repository = {
      findSelection: vi.fn().mockResolvedValue({
        store: { id: "store", region: "서울", name: "홍대점" },
        menu: null
      })
    } as unknown as PurchaseRequestsRepository;
    await expect(
      new PurchaseRequestsService(repository).create("requester", {
        storeId: "store",
        menuId: "disabled-menu",
        quantity: 1,
        desiredTime: "2030.01.01 15:00 ~ 18:00",
        openChatUrl: "https://open.kakao.com/o/example"
      })
    ).rejects.toMatchObject({ code: "MENU_UNAVAILABLE" });
  });

  it("allows only the requester to edit an open purchase request", async () => {
    const updateOpen = vi.fn().mockResolvedValue({ id: "request-1", quantity: 3 });
    const repository = {
      find: vi.fn().mockResolvedValue({
        id: "request-1",
        requesterId: "requester",
        status: "OPEN"
      }),
      updateOpen
    } as unknown as PurchaseRequestsRepository;
    const service = new PurchaseRequestsService(repository);

    await service.update("request-1", "requester", { quantity: 3 });
    expect(updateOpen).toHaveBeenCalledWith("request-1", "requester", { quantity: 3 });
    await expect(service.update("request-1", "other", { quantity: 2 })).rejects.toMatchObject({
      code: "PURCHASE_REQUEST_FORBIDDEN"
    });
  });

  it("uses upsert/deleteMany semantics through idempotent favorite methods", async () => {
    const add = vi.fn().mockResolvedValue({ id: "favorite" });
    const remove = vi.fn().mockResolvedValue(undefined);
    const favorites = {
      findPost: vi.fn().mockResolvedValue({ id: "post-1", deletedAt: null }),
      add,
      remove
    } as unknown as FavoritesRepository;
    const service = new FavoritesService(favorites);
    await service.add("user", "post-1");
    await service.remove("user", "post-1");
    expect(add).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });

  it("blocks duplicate and self reports", async () => {
    const selfRepo = {
      findPost: vi.fn().mockResolvedValue({ writerId: "me", deletedAt: null })
    } as unknown as ReportsRepository;
    await expect(
      new ReportsService(selfRepo).create("me", { targetPostId: "p", reason: "FRAUD" })
    ).rejects.toMatchObject({ code: "SELF_REPORT_NOT_ALLOWED" });
    const duplicateRepo = {
      findPost: vi.fn().mockResolvedValue({ writerId: "other", deletedAt: null }),
      findExisting: vi.fn().mockResolvedValue({ id: "existing" })
    } as unknown as ReportsRepository;
    await expect(
      new ReportsService(duplicateRepo).create("me", { targetPostId: "p", reason: "FRAUD" })
    ).rejects.toMatchObject({ code: "REPORT_ALREADY_EXISTS" });
  });

  it("delegates suspension to the repository transaction and prevents self-suspension", async () => {
    const suspend = vi.fn().mockResolvedValue({ id: "user" });
    const repository = {
      findUser: vi.fn().mockResolvedValue({ id: "user" }),
      suspend
    } as unknown as AdminRepository;
    const service = new AdminService(repository);
    await service.suspend("user", "admin", "운영 정책 위반");
    expect(suspend).toHaveBeenCalledWith("user", "admin", "운영 정책 위반");
    await expect(service.suspend("admin", "admin", "self")).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
  });

  it("treats missing store menu overrides as available for administrators", async () => {
    const repository = {
      findStore: vi.fn().mockResolvedValue({ id: "store" }),
      storeMenus: vi.fn().mockResolvedValue({
        items: [
          { id: "default", name: "아메리카노", storeMenus: [] },
          {
            id: "blocked",
            name: "카페라떼",
            storeMenus: [{ availability: "UNAVAILABLE" }]
          }
        ],
        total: 2
      })
    } as unknown as AdminRepository;

    const result = await new AdminService(repository).storeMenus("store", { page: 1, limit: 100 });
    expect(result.items).toEqual([
      expect.objectContaining({ id: "default", availability: "AVAILABLE" }),
      expect.objectContaining({ id: "blocked", availability: "UNAVAILABLE" })
    ]);
  });
});
