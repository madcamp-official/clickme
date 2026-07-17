import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { prisma } from "../../infrastructure/prisma/client.js";

export class EventsRepository {
  constructor(private readonly db: PrismaClient = prisma) {}
  async list(where: Prisma.EventWhereInput, page: number, limit: number) {
    const [items, total] = await Promise.all([
      this.db.event.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { startDate: "asc" }
      }),
      this.db.event.count({ where })
    ]);
    return { items, total };
  }
  find(id: string) {
    return this.db.event.findUnique({ where: { id } });
  }
  create(data: Prisma.EventCreateInput) {
    return this.db.event.create({ data });
  }
  update(id: string, data: Prisma.EventUpdateInput) {
    return this.db.event.update({ where: { id }, data });
  }
  delete(id: string) {
    return this.db.event.delete({ where: { id } });
  }
}
