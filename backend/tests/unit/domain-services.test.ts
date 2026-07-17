import { describe, expect, it, vi } from "vitest";
import type { AdminRepository } from "../../src/modules/admin/admin.repository.js";
import { AdminService } from "../../src/modules/admin/admin.service.js";
import type { EventsRepository } from "../../src/modules/events/events.repository.js";
import type { FavoritesRepository } from "../../src/modules/favorites/favorites.repository.js";
import { FavoritesService } from "../../src/modules/favorites/favorites.service.js";
import type { PostsRepository } from "../../src/modules/posts/posts.repository.js";
import { PostsService } from "../../src/modules/posts/posts.service.js";
import type { ReportsRepository } from "../../src/modules/reports/reports.repository.js";
import { ReportsService } from "../../src/modules/reports/reports.service.js";
import type { ReviewsRepository } from "../../src/modules/reviews/reviews.repository.js";
import { ReviewsService } from "../../src/modules/reviews/reviews.service.js";
import type { StoresRepository } from "../../src/modules/stores/stores.repository.js";

const basePost = {
  id: "post-1",
  writerId: "seller",
  storeId: "store",
  eventId: null,
  discount: 20,
  totalCount: 5,
  remainCount: 5,
  meetingTime: new Date(Date.now() + 60_000),
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

  it("enforces closed, non-self, unique reviews and delegates the rating transaction", async () => {
    const transaction = vi.fn().mockResolvedValue({ id: "review" });
    const reviews = {
      findPost: vi.fn().mockResolvedValue({ ...basePost, status: "CLOSED" }),
      findExisting: vi.fn().mockResolvedValue(null),
      createAndRecalculate: transaction
    } as unknown as ReviewsRepository;
    await new ReviewsService(reviews).create("buyer", {
      postId: "post-1",
      rating: 5,
      content: "좋아요"
    });
    expect(transaction).toHaveBeenCalledWith(
      expect.objectContaining({ sellerId: "seller", writerId: "buyer" })
    );
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
});
