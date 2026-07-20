export type NctWishEventMenuGroup = "MISSION" | "GENERAL";

export interface NctWishEventMenuDefinition {
  catalogName: string;
  displayName: string;
  group: NctWishEventMenuGroup;
  order: number;
}

export const NCT_WISH_EVENT_MENUS: readonly NctWishEventMenuDefinition[] = [
  {
    catalogName: "저당 꿀배 XO야쿠르트",
    displayName: "저당 꿀배 XO요거트",
    group: "MISSION",
    order: 1
  },
  {
    catalogName: "골드망고스무디",
    displayName: "골드망고 스무디",
    group: "MISSION",
    order: 2
  },
  {
    catalogName: "초코허니퐁크러쉬",
    displayName: "초코허니 퐁크러쉬",
    group: "MISSION",
    order: 3
  },
  {
    catalogName: "밀크쉐이크",
    displayName: "밀크쉐이크",
    group: "GENERAL",
    order: 4
  },
  {
    catalogName: "메가베리 아사이볼",
    displayName: "메가베리 아사이볼",
    group: "GENERAL",
    order: 5
  },
  {
    catalogName: "망고요거트스무디",
    displayName: "망고요거트 스무디",
    group: "GENERAL",
    order: 6
  },
  {
    catalogName: "제로 부스트 에이드",
    displayName: "제로 부스트 에이드",
    group: "GENERAL",
    order: 7
  },
  {
    catalogName: "메가리카노",
    displayName: "메가리카노",
    group: "GENERAL",
    order: 8
  },
  {
    catalogName: "코코넛 커피 스무디",
    displayName: "코코넛 커피 스무디",
    group: "GENERAL",
    order: 9
  },
  {
    catalogName: "흑당밀크티라떼",
    displayName: "흑당 밀크티라떼",
    group: "GENERAL",
    order: 10
  }
] as const;

export const NCT_WISH_EVENT_MENU_CATALOG_NAMES = NCT_WISH_EVENT_MENUS.map(
  (menu) => menu.catalogName
);

const byCatalogName = new Map(NCT_WISH_EVENT_MENUS.map((menu) => [menu.catalogName, menu]));

export function nctWishEventMenuDefinition(
  catalogName: string
): NctWishEventMenuDefinition | undefined {
  return byCatalogName.get(catalogName);
}

export function nctWishEventMenuDisplayName(catalogName: string): string {
  return nctWishEventMenuDefinition(catalogName)?.displayName ?? catalogName;
}
