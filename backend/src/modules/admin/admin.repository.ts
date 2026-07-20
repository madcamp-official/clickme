import type { Prisma, PrismaClient, ReportStatus } from "../../generated/prisma/client.js";
import { prisma } from "../../infrastructure/prisma/client.js";
import type { AdminDatabaseTable } from "./admin.schema.js";

export class AdminRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async dashboard() {
    const [
      users,
      activeUsers,
      suspendedUsers,
      posts,
      openPosts,
      participations,
      purchaseRequests,
      openPurchaseRequests,
      acceptedPurchaseRequests,
      pendingReports,
      pendingInquiries,
      activeStores,
      activeMenus,
      unreadNotifications,
      recentActions
    ] = await Promise.all([
      this.db.user.count({ where: { deletedAt: null } }),
      this.db.user.count({ where: { status: "ACTIVE", deletedAt: null } }),
      this.db.user.count({ where: { status: "SUSPENDED", deletedAt: null } }),
      this.db.post.count({ where: { deletedAt: null } }),
      this.db.post.count({ where: { status: "OPEN", deletedAt: null } }),
      this.db.participation.count({ where: { status: "CONFIRMED" } }),
      this.db.purchaseRequest.count({ where: { status: { not: "CANCELLED" } } }),
      this.db.purchaseRequest.count({ where: { status: "OPEN" } }),
      this.db.purchaseRequest.count({ where: { status: "ACCEPTED" } }),
      this.db.report.count({ where: { status: "PENDING" } }),
      this.db.inquiry.count({ where: { status: "PENDING" } }),
      this.db.store.count({ where: { isActive: true } }),
      this.db.menu.count({ where: { isActive: true } }),
      this.db.notification.count({ where: { readAt: null } }),
      this.db.adminActionLog.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: { admin: { select: { id: true, nickname: true } } }
      })
    ]);
    return {
      counts: {
        users,
        activeUsers,
        suspendedUsers,
        posts,
        openPosts,
        participations,
        purchaseRequests,
        openPurchaseRequests,
        acceptedPurchaseRequests,
        pendingReports,
        pendingInquiries,
        activeStores,
        activeMenus,
        unreadNotifications
      },
      recentActions
    };
  }

  async database(
    table: AdminDatabaseTable,
    search: string | undefined,
    page: number,
    limit: number
  ) {
    const skip = (page - 1) * limit;

    switch (table) {
      case "users": {
        const where: Prisma.UserWhereInput = search
          ? {
              OR: [
                { id: { contains: search, mode: "insensitive" } },
                { nickname: { contains: search, mode: "insensitive" } }
              ]
            }
          : {};
        const [items, total] = await Promise.all([
          this.db.user.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              nickname: true,
              role: true,
              status: true,
              rating: true,
              reviewCount: true,
              lastLoginAt: true,
              suspendedAt: true,
              suspensionReason: true,
              deletedAt: true,
              createdAt: true,
              updatedAt: true
            }
          }),
          this.db.user.count({ where })
        ]);
        return { items, total };
      }
      case "posts": {
        const where: Prisma.PostWhereInput = search
          ? {
              OR: [
                { id: { contains: search, mode: "insensitive" } },
                { meetingPlace: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
                { writer: { nickname: { contains: search, mode: "insensitive" } } },
                { store: { name: { contains: search, mode: "insensitive" } } }
              ]
            }
          : {};
        const [items, total] = await Promise.all([
          this.db.post.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: "desc" },
            omit: { openChatUrl: true },
            include: {
              writer: { select: { id: true, nickname: true } },
              store: { select: { id: true, name: true, region: true } },
              event: { select: { id: true, title: true } }
            }
          }),
          this.db.post.count({ where })
        ]);
        return { items, total };
      }
      case "participations": {
        const where: Prisma.ParticipationWhereInput = search
          ? {
              OR: [
                { id: { contains: search, mode: "insensitive" } },
                { pickupStore: { contains: search, mode: "insensitive" } },
                { user: { nickname: { contains: search, mode: "insensitive" } } }
              ]
            }
          : {};
        const [items, total] = await Promise.all([
          this.db.participation.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: "desc" },
            include: {
              user: { select: { id: true, nickname: true } },
              post: { select: { id: true, meetingPlace: true, status: true } }
            }
          }),
          this.db.participation.count({ where })
        ]);
        return { items, total };
      }
      case "purchaseRequests": {
        const where: Prisma.PurchaseRequestWhereInput = search
          ? {
              OR: [
                { id: { contains: search, mode: "insensitive" } },
                { city: { contains: search, mode: "insensitive" } },
                { branch: { contains: search, mode: "insensitive" } },
                { menu: { contains: search, mode: "insensitive" } },
                { note: { contains: search, mode: "insensitive" } },
                { requester: { nickname: { contains: search, mode: "insensitive" } } },
                { accepter: { nickname: { contains: search, mode: "insensitive" } } }
              ]
            }
          : {};
        const [items, total] = await Promise.all([
          this.db.purchaseRequest.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: "desc" },
            omit: { openChatUrl: true },
            include: {
              requester: { select: { id: true, nickname: true } },
              accepter: { select: { id: true, nickname: true } },
              store: { select: { id: true, name: true } },
              selectedMenu: { select: { id: true, name: true, variant: true } }
            }
          }),
          this.db.purchaseRequest.count({ where })
        ]);
        return { items, total };
      }
      case "stores": {
        const where: Prisma.StoreWhereInput = search
          ? {
              OR: [
                { id: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
                { region: { contains: search, mode: "insensitive" } },
                { district: { contains: search, mode: "insensitive" } },
                { address: { contains: search, mode: "insensitive" } }
              ]
            }
          : {};
        const [items, total] = await Promise.all([
          this.db.store.findMany({ where, skip, take: limit, orderBy: { updatedAt: "desc" } }),
          this.db.store.count({ where })
        ]);
        return { items, total };
      }
      case "menus": {
        const where: Prisma.MenuWhereInput = search
          ? {
              OR: [
                { id: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
                { englishName: { contains: search, mode: "insensitive" } }
              ]
            }
          : {};
        const [items, total] = await Promise.all([
          this.db.menu.findMany({ where, skip, take: limit, orderBy: { updatedAt: "desc" } }),
          this.db.menu.count({ where })
        ]);
        return { items, total };
      }
      case "storeMenus": {
        const where: Prisma.StoreMenuWhereInput = search
          ? {
              OR: [
                { store: { name: { contains: search, mode: "insensitive" } } },
                { menu: { name: { contains: search, mode: "insensitive" } } }
              ]
            }
          : {};
        const [items, total] = await Promise.all([
          this.db.storeMenu.findMany({
            where,
            skip,
            take: limit,
            orderBy: { updatedAt: "desc" },
            include: {
              store: { select: { id: true, name: true } },
              menu: { select: { id: true, name: true, variant: true } },
              verifiedBy: { select: { id: true, nickname: true } }
            }
          }),
          this.db.storeMenu.count({ where })
        ]);
        return { items, total };
      }
      case "events": {
        const where: Prisma.EventWhereInput = search
          ? {
              OR: [
                { id: { contains: search, mode: "insensitive" } },
                { title: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } }
              ]
            }
          : {};
        const [items, total] = await Promise.all([
          this.db.event.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }),
          this.db.event.count({ where })
        ]);
        return { items, total };
      }
      case "inquiries": {
        const where: Prisma.InquiryWhereInput = search
          ? {
              OR: [
                { id: { contains: search, mode: "insensitive" } },
                { content: { contains: search, mode: "insensitive" } },
                { user: { nickname: { contains: search, mode: "insensitive" } } }
              ]
            }
          : {};
        const [items, total] = await Promise.all([
          this.db.inquiry.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: "desc" },
            include: { user: { select: { id: true, nickname: true } } }
          }),
          this.db.inquiry.count({ where })
        ]);
        return { items, total };
      }
      case "reviews": {
        const where: Prisma.ReviewWhereInput = search
          ? {
              OR: [
                { id: { contains: search, mode: "insensitive" } },
                { content: { contains: search, mode: "insensitive" } },
                { writer: { nickname: { contains: search, mode: "insensitive" } } },
                { seller: { nickname: { contains: search, mode: "insensitive" } } }
              ]
            }
          : {};
        const [items, total] = await Promise.all([
          this.db.review.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: "desc" },
            include: {
              writer: { select: { id: true, nickname: true } },
              seller: { select: { id: true, nickname: true } }
            }
          }),
          this.db.review.count({ where })
        ]);
        return { items, total };
      }
      case "favorites": {
        const where: Prisma.FavoriteWhereInput = search
          ? {
              OR: [
                { id: { contains: search, mode: "insensitive" } },
                { user: { nickname: { contains: search, mode: "insensitive" } } },
                { post: { meetingPlace: { contains: search, mode: "insensitive" } } }
              ]
            }
          : {};
        const [items, total] = await Promise.all([
          this.db.favorite.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: "desc" },
            include: {
              user: { select: { id: true, nickname: true } },
              post: { select: { id: true, meetingPlace: true, status: true } }
            }
          }),
          this.db.favorite.count({ where })
        ]);
        return { items, total };
      }
      case "reports": {
        const where: Prisma.ReportWhereInput = search
          ? {
              OR: [
                { id: { contains: search, mode: "insensitive" } },
                { detail: { contains: search, mode: "insensitive" } },
                { adminNote: { contains: search, mode: "insensitive" } },
                { reporter: { nickname: { contains: search, mode: "insensitive" } } }
              ]
            }
          : {};
        const [items, total] = await Promise.all([
          this.db.report.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: "desc" },
            include: {
              reporter: { select: { id: true, nickname: true } },
              handledBy: { select: { id: true, nickname: true } }
            }
          }),
          this.db.report.count({ where })
        ]);
        return { items, total };
      }
      case "notifications": {
        const where: Prisma.NotificationWhereInput = search
          ? {
              OR: [
                { id: { contains: search, mode: "insensitive" } },
                { title: { contains: search, mode: "insensitive" } },
                { message: { contains: search, mode: "insensitive" } },
                { recipient: { nickname: { contains: search, mode: "insensitive" } } }
              ]
            }
          : {};
        const [items, total] = await Promise.all([
          this.db.notification.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: "desc" },
            include: {
              recipient: { select: { id: true, nickname: true } },
              actor: { select: { id: true, nickname: true } }
            }
          }),
          this.db.notification.count({ where })
        ]);
        return { items, total };
      }
      case "adminActions": {
        const where: Prisma.AdminActionLogWhereInput = search
          ? {
              OR: [
                { id: { contains: search, mode: "insensitive" } },
                { action: { contains: search, mode: "insensitive" } },
                { targetType: { contains: search, mode: "insensitive" } },
                { targetId: { contains: search, mode: "insensitive" } },
                { reason: { contains: search, mode: "insensitive" } },
                { admin: { nickname: { contains: search, mode: "insensitive" } } }
              ]
            }
          : {};
        const [items, total] = await Promise.all([
          this.db.adminActionLog.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: "desc" },
            include: { admin: { select: { id: true, nickname: true } } }
          }),
          this.db.adminActionLog.count({ where })
        ]);
        return { items, total };
      }
    }
  }

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
  findStore(id: string) {
    return this.db.store.findUnique({ where: { id } });
  }
  findMenu(id: string) {
    return this.db.menu.findUnique({ where: { id } });
  }
  async storeMenus(storeId: string, where: Prisma.MenuWhereInput, page: number, limit: number) {
    const [items, total] = await Promise.all([
      this.db.menu.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ category: "asc" }, { name: "asc" }, { variant: "asc" }],
        select: {
          id: true,
          name: true,
          englishName: true,
          category: true,
          variant: true,
          imageUrl: true,
          storeMenus: {
            where: { storeId },
            select: { availability: true }
          }
        }
      }),
      this.db.menu.count({ where })
    ]);
    return { items, total };
  }
  setStoreMenuAvailability(
    storeId: string,
    menuId: string,
    availability: "AVAILABLE" | "UNAVAILABLE",
    adminId: string
  ) {
    return this.db.$transaction(async (tx) => {
      if (availability === "AVAILABLE") {
        await tx.storeMenu.deleteMany({ where: { storeId, menuId } });
      } else {
        await tx.storeMenu.upsert({
          where: { storeId_menuId: { storeId, menuId } },
          create: { storeId, menuId, availability, verifiedById: adminId },
          update: { availability, verifiedById: adminId, verifiedAt: new Date() }
        });
      }
      await tx.adminActionLog.create({
        data: {
          adminId,
          action: "STORE_MENU_UPDATED",
          targetType: "StoreMenu",
          targetId: `${storeId}:${menuId}`,
          metadata: { storeId, menuId, availability }
        }
      });
      return { storeId, menuId, availability };
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
