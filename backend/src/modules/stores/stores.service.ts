import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/AppError.js";
import { toPagination } from "../../common/utils/pagination.js";
import { StoresRepository } from "./stores.repository.js";

export class StoresService {
  constructor(private readonly repository = new StoresRepository()) {}
  async list(input: { region?: string; keyword?: string; page: number; limit: number }) {
    const where: Prisma.StoreWhereInput = {
      ...(input.region ? { region: { equals: input.region, mode: "insensitive" } } : {}),
      ...(input.keyword
        ? {
            OR: [
              { name: { contains: input.keyword, mode: "insensitive" } },
              { address: { contains: input.keyword, mode: "insensitive" } }
            ]
          }
        : {})
    };
    const result = await this.repository.list(where, input.page, input.limit);
    return { items: result.items, pagination: toPagination(input.page, input.limit, result.total) };
  }
  async get(id: string) {
    const store = await this.repository.find(id);
    if (!store) throw new AppError("STORE_NOT_FOUND", "매장을 찾을 수 없습니다.", 404);
    return store;
  }
  create(data: Prisma.StoreCreateInput) {
    return this.repository.create(data);
  }
  async update(id: string, data: Prisma.StoreUpdateInput) {
    await this.get(id);
    return this.repository.update(id, data);
  }
}
