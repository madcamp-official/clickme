import type { Prisma, PrismaClient, ReportStatus } from "../../generated/prisma/client.js";
import { prisma } from "../../infrastructure/prisma/client.js";

export class AdminRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async reports(status: ReportStatus | undefined, page: number, limit: number) {
    const where: Prisma.ReportWhereInput = status ? { status } : {};
    const [items, total] = await Promise.all([
      this.db.report.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          reporter: { select: { id: true, nickname: true } },
          targetPost: { select: { id: true, writerId: true, meetingPlace: true, deletedAt: true } },
          handledBy: { select: { id: true, nickname: true } }
        }
      }),
      this.db.report.count({ where })
    ]);
    return { items, total };
  }
  report(id: string) {
    return this.db.report.findUnique({
      where: { id },
      include: {
        reporter: { select: { id: true, nickname: true } },
        targetPost: true,
        handledBy: { select: { id: true, nickname: true } }
      }
    });
  }
  handleReport(id: string, adminId: string, status: ReportStatus, adminNote: string) {
    return this.db.$transaction(async (tx) => {
      const report = await tx.report.update({
        where: { id },
        data: { status, adminNote, handledById: adminId, handledAt: new Date() }
      });
      await tx.adminActionLog.create({
        data: {
          adminId,
          action: "REPORT_HANDLED",
          targetType: "Report",
          targetId: id,
          reason: adminNote,
          metadata: { status }
        }
      });
      return report;
    });
  }
  async users(where: Prisma.UserWhereInput, page: number, limit: number) {
    const [items, total] = await Promise.all([
      this.db.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          nickname: true,
          profileImage: true,
          role: true,
          status: true,
          rating: true,
          reviewCount: true,
          suspendedAt: true,
          suspensionReason: true,
          createdAt: true
        }
      }),
      this.db.user.count({ where })
    ]);
    return { items, total };
  }
  findUser(id: string) {
    return this.db.user.findUnique({ where: { id } });
  }
  suspend(userId: string, adminId: string, reason: string) {
    return this.db.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { status: "SUSPENDED", suspendedAt: new Date(), suspensionReason: reason }
      });
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() }
      });
      await tx.adminActionLog.create({
        data: { adminId, action: "USER_SUSPENDED", targetType: "User", targetId: userId, reason }
      });
      return user;
    });
  }
  unsuspend(userId: string, adminId: string, reason?: string) {
    return this.db.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { status: "ACTIVE", suspendedAt: null, suspensionReason: null }
      });
      await tx.adminActionLog.create({
        data: {
          adminId,
          action: "USER_UNSUSPENDED",
          targetType: "User",
          targetId: userId,
          ...(reason ? { reason } : {})
        }
      });
      return user;
    });
  }
  async posts(deleted: boolean | undefined, page: number, limit: number) {
    const where: Prisma.PostWhereInput =
      deleted === undefined ? {} : { deletedAt: deleted ? { not: null } : null };
    const [rows, total] = await Promise.all([
      this.db.post.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { writer: { select: { id: true, nickname: true } }, store: true },
        omit: { openChatUrl: true }
      }),
      this.db.post.count({ where })
    ]);
    return { items: rows, total };
  }
  findPost(id: string) {
    return this.db.post.findUnique({ where: { id } });
  }
  setPostDeleted(id: string, adminId: string, deleted: boolean, reason?: string) {
    return this.db.$transaction(async (tx) => {
      const post = await tx.post.update({
        where: { id },
        data: { deletedAt: deleted ? new Date() : null }
      });
      await tx.adminActionLog.create({
        data: {
          adminId,
          action: deleted ? "POST_DELETED" : "POST_RESTORED",
          targetType: "Post",
          targetId: id,
          ...(reason ? { reason } : {})
        }
      });
      return post;
    });
  }
  createStore(data: Prisma.StoreCreateInput, adminId: string) {
    return this.db.$transaction(async (tx) => {
      const store = await tx.store.create({ data });
      await tx.adminActionLog.create({
        data: { adminId, action: "STORE_CREATED", targetType: "Store", targetId: store.id }
      });
      return store;
    });
  }
  updateStore(id: string, data: Prisma.StoreUpdateInput, adminId: string) {
    return this.db.$transaction(async (tx) => {
      const store = await tx.store.update({ where: { id }, data });
      await tx.adminActionLog.create({
        data: { adminId, action: "STORE_UPDATED", targetType: "Store", targetId: id }
      });
      return store;
    });
  }
  createEvent(data: Prisma.EventCreateInput, adminId: string) {
    return this.db.$transaction(async (tx) => {
      const event = await tx.event.create({ data });
      await tx.adminActionLog.create({
        data: { adminId, action: "EVENT_CREATED", targetType: "Event", targetId: event.id }
      });
      return event;
    });
  }
  findEvent(id: string) {
    return this.db.event.findUnique({ where: { id } });
  }
  updateEvent(id: string, data: Prisma.EventUpdateInput, adminId: string) {
    return this.db.$transaction(async (tx) => {
      const event = await tx.event.update({ where: { id }, data });
      await tx.adminActionLog.create({
        data: { adminId, action: "EVENT_UPDATED", targetType: "Event", targetId: id }
      });
      return event;
    });
  }
  deleteEvent(id: string, adminId: string) {
    return this.db.$transaction(async (tx) => {
      const event = await tx.event.delete({ where: { id } });
      await tx.adminActionLog.create({
        data: { adminId, action: "EVENT_DELETED", targetType: "Event", targetId: id }
      });
      return event;
    });
  }
}
