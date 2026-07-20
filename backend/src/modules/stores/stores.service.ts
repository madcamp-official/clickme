import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/AppError.js";
import { toPagination } from "../../common/utils/pagination.js";
import { StoresRepository } from "./stores.repository.js";
import {
  NCT_WISH_EVENT_MENU_CATALOG_NAMES,
  nctWishEventMenuDefinition
} from "../menus/nct-wish-event-menus.js";

export class StoresService {
  constructor(private readonly repository = new StoresRepository()) {}
  async list(input: { region?: string; keyword?: string; page: number; limit: number }) {
    const where: Prisma.StoreWhereInput = {
      isActive: true,
      ...(input.region ? { region: { equals: input.region, mode: "insensitive" } } : {}),
      ...(input.keyword
        ? {
            OR: [
              { name: { contains: input.keyword, mode: "insensitive" } },
              { address: { contains: input.keyword, mode: "insensitive" } },
              { district: { contains: input.keyword, mode: "insensitive" } }
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
  async menus(
    storeId: string,
    input: {
      category?: "DRINK" | "FOOD" | "PRODUCT";
      keyword?: string;
      page: number;
      limit: number;
    }
  ) {
    await this.get(storeId);
    const where: Prisma.MenuWhereInput = {
      isActive: true,
      name: { in: [...NCT_WISH_EVENT_MENU_CATALOG_NAMES] },
      ...(input.category ? { category: input.category } : {}),
      ...(input.keyword
        ? {
            OR: [
              { name: { contains: input.keyword, mode: "insensitive" } },
              { englishName: { contains: input.keyword, mode: "insensitive" } }
            ]
          }
        : {})
    };
    const result = await this.repository.listMenus(storeId, where, input.page, input.limit);
    const items = result.items
      .map((menu) => {
        const eventMenu = nctWishEventMenuDefinition(menu.name);
        if (!eventMenu) return null;
        return {
          ...menu,
          name: eventMenu.displayName,
          variant: "NONE",
          eventGroup: eventMenu.group,
          eventOrder: eventMenu.order
        };
      })
      .filter((menu): menu is NonNullable<typeof menu> => menu !== null)
      .sort((left, right) => left.eventOrder - right.eventOrder);
    return { items, pagination: toPagination(input.page, input.limit, result.total) };
  }
  create(data: Prisma.StoreCreateInput) {
    return this.repository.create(data);
  }
  async update(id: string, data: Prisma.StoreUpdateInput) {
    await this.get(id);
    return this.repository.update(id, data);
  }
  async regions() {
    const regions = await this.repository.regionCounts();
    return regions.map((item) => ({ region: item.region, count: item._count._all }));
  }
}
