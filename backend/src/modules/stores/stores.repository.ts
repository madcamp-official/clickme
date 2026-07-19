import type { PrismaClient, Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../infrastructure/prisma/client.js";

export class StoresRepository {
  constructor(private readonly db: PrismaClient = prisma) {}
  async list(where: Prisma.StoreWhereInput, page: number, limit: number) {
    const [items, total] = await Promise.all([
      this.db.store.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ region: "asc" }, { name: "asc" }]
      }),
      this.db.store.count({ where })
    ]);
    return { items, total };
  }
  find(id: string) {
    return this.db.store.findUnique({ where: { id } });
  }
  create(data: Prisma.StoreCreateInput) {
    return this.db.store.create({ data });
  }
  update(id: string, data: Prisma.StoreUpdateInput) {
    return this.db.store.update({ where: { id }, data });
  }
  regionCounts() {
    return this.db.store.groupBy({
      by: ["region"],
      where: { isActive: true },
      _count: { _all: true },
      orderBy: { region: "asc" }
    });
  }
}
