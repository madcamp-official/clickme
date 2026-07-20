import { describe, expect, it, vi } from "vitest";
import type { NotificationsRepository } from "../../src/modules/notifications/notifications.repository.js";
import { NotificationsService } from "../../src/modules/notifications/notifications.service.js";

describe("NotificationsService", () => {
  it("returns unread count with paginated notifications", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue({ items: [{ id: "notification-1" }], total: 1, unreadCount: 1 })
    } as unknown as NotificationsRepository;
    const result = await new NotificationsService(repository).list("user-1", false, 1, 50);
    expect(result.unreadCount).toBe(1);
    expect(result.pagination).toMatchObject({ total: 1, hasNext: false });
  });

  it("does not allow a user to mark another user's notification", async () => {
    const repository = {
      markRead: vi.fn().mockResolvedValue({ notification: null, changed: false })
    } as unknown as NotificationsRepository;
    await expect(
      new NotificationsService(repository).markRead("user-1", "someone-elses-notification")
    ).rejects.toMatchObject({ code: "NOTIFICATION_NOT_FOUND", statusCode: 404 });
  });
});
