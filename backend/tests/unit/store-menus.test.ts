import { describe, expect, it, vi } from "vitest";
import type { Prisma, PrismaClient } from "../../src/generated/prisma/client.js";
import { StoresRepository } from "../../src/modules/stores/stores.repository.js";
import { StoresService } from "../../src/modules/stores/stores.service.js";
import { PurchaseRequestsRepository } from "../../src/modules/purchase-requests/purchase-requests.repository.js";
import { NCT_WISH_EVENT_MENU_CATALOG_NAMES } from "../../src/modules/menus/nct-wish-event-menus.js";

describe("store menu availability", () => {
  it("returns menus unless the store has an UNAVAILABLE override and does not select status", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "menu", name: "아메리카노" }]);
    const count = vi.fn().mockResolvedValue(1);
    const db = { menu: { findMany, count } } as unknown as PrismaClient;

    await new StoresRepository(db).listMenus("store", { isActive: true }, 1, 100);

    const query = findMany.mock.calls[0]?.[0] as Prisma.MenuFindManyArgs;
    expect(query.where).toMatchObject({
      storeMenus: { none: { storeId: "store", availability: "UNAVAILABLE" } }
    });
    expect(query.select).not.toHaveProperty("availability");
  });

  it("limits the public store menu response to the ten event menus and maps event labels", async () => {
    const listMenus = vi.fn().mockResolvedValue({
      items: [
        {
          id: "mission",
          name: "저당 꿀배 XO야쿠르트",
          englishName: null,
          category: "DRINK",
          variant: "ICE",
          imageUrl: "https://example.com/mission.png"
        },
        {
          id: "general",
          name: "흑당밀크티라떼",
          englishName: null,
          category: "DRINK",
          variant: "ICE",
          imageUrl: "https://example.com/general.png"
        }
      ],
      total: 2
    });
    const repository = {
      find: vi.fn().mockResolvedValue({ id: "store" }),
      listMenus
    } as unknown as StoresRepository;

    const result = await new StoresService(repository).menus("store", { page: 1, limit: 300 });
    const where = listMenus.mock.calls[0]?.[1] as Prisma.MenuWhereInput;

    expect(NCT_WISH_EVENT_MENU_CATALOG_NAMES).toHaveLength(10);
    expect(where.name).toEqual({ in: NCT_WISH_EVENT_MENU_CATALOG_NAMES });
    expect(result.items).toEqual([
      expect.objectContaining({
        id: "mission",
        name: "저당 꿀배 XO요거트",
        variant: "NONE",
        eventGroup: "MISSION",
        eventOrder: 1
      }),
      expect.objectContaining({
        id: "general",
        name: "흑당 밀크티라떼",
        variant: "NONE",
        eventGroup: "GENERAL",
        eventOrder: 10
      })
    ]);
  });

  it("rejects non-event menu IDs during purchase selection", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const db = {
      store: { findFirst: vi.fn().mockResolvedValue({ id: "store" }) },
      menu: { findFirst }
    } as unknown as PrismaClient;

    await new PurchaseRequestsRepository(db).findSelection("store", "menu");

    const query = findFirst.mock.calls[0]?.[0] as Prisma.MenuFindFirstArgs;
    expect(query.where).toMatchObject({
      id: "menu",
      name: { in: NCT_WISH_EVENT_MENU_CATALOG_NAMES }
    });
  });
});
