import type { PrismaClient } from "../../generated/prisma/client.js";
import { prisma } from "../../infrastructure/prisma/client.js";

const actorSelect = { id: true, nickname: true, profileImage: true } as const;

export class NotificationsRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list(userId: string, unreadOnly: boolean, page: number, limit: number) {
    const where = { recipientId: userId, ...(unreadOnly ? { readAt: null } : {}) };
    const [items, total, unreadCount] = await Promise.all([
      this.db.notification.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { actor: { select: actorSelect } }
      }),
      this.db.notification.count({ where }),
      this.db.notification.count({ where: { recipientId: userId, readAt: null } })
    ]);
    return { items, total, unreadCount };
  }

  async markRead(userId: string, id: string) {
    const readAt = new Date();
    const updated = await this.db.notification.updateMany({
      where: { id, recipientId: userId, readAt: null },
      data: { readAt }
    });
    const notification = await this.db.notification.findFirst({
      where: { id, recipientId: userId },
      include: { actor: { select: actorSelect } }
    });
    return { notification, changed: updated.count === 1 };
  }

  async markAllRead(userId: string) {
    const result = await this.db.notification.updateMany({
      where: { recipientId: userId, readAt: null },
      data: { readAt: new Date() }
    });
    return { updatedCount: result.count };
  }
}
