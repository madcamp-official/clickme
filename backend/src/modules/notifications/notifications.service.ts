import { AppError } from "../../common/errors/AppError.js";
import { toPagination } from "../../common/utils/pagination.js";
import { NotificationsRepository } from "./notifications.repository.js";

export class NotificationsService {
  constructor(private readonly repository = new NotificationsRepository()) {}

  async list(userId: string, unreadOnly: boolean, page: number, limit: number) {
    const result = await this.repository.list(userId, unreadOnly, page, limit);
    return {
      items: result.items,
      unreadCount: result.unreadCount,
      pagination: toPagination(page, limit, result.total)
    };
  }

  async markRead(userId: string, id: string) {
    const result = await this.repository.markRead(userId, id);
    if (!result.notification) {
      throw new AppError("NOTIFICATION_NOT_FOUND", "알림을 찾을 수 없습니다.", 404);
    }
    return result.notification;
  }

  markAllRead(userId: string) {
    return this.repository.markAllRead(userId);
  }
}
