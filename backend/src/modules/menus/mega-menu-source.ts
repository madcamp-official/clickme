import { createHash } from "node:crypto";

export const MEGA_MENU_SOURCE = "MEGA_OFFICIAL";
export const MEGA_MENU_SOURCE_URL = "https://www.mega-mgccoffee.com/menu/";

const menuUrl = "https://www.mega-mgccoffee.com/menu/menu.php";
const pageSize = 20;

const categorySources = [
  { category: "DRINK", officialId: "1" },
  { category: "FOOD", officialId: "2" },
  { category: "PRODUCT", officialId: "3" }
] as const;

export type MegaMenuCategory = (typeof categorySources)[number]["category"];

export interface MegaMenuRecord {
  externalId: string;
  brand: "메가MGC커피";
  name: string;
  englishName: string | null;
  category: MegaMenuCategory;
  variant: string;
  description: string | null;
  imageUrl: string | null;
  source: typeof MEGA_MENU_SOURCE;
  sourceUrl: typeof MEGA_MENU_SOURCE_URL;
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

export function megaMenuExternalId(
  category: MegaMenuCategory,
  name: string,
  variant: string
): string {
  const normalized = `${category}\n${name.trim().toLowerCase()}\n${variant.trim().toUpperCase()}`;
  return `mega-menu-${createHash("sha256").update(normalized).digest("hex").slice(0, 24)}`;
}

export function parseMegaMenuHtml(html: string, category: MegaMenuCategory): MegaMenuRecord[] {
  const records = new Map<string, MegaMenuRecord>();
  for (const item of html.split(/<a\s+class="inner_modal_open"[^>]*>/).slice(1)) {
    const card = item.split("</a>", 1)[0] ?? "";
    const nameMatch = /<b>([\s\S]*?)<\/b>/.exec(card);
    if (!nameMatch) continue;
    const variantMatch = /cont_gallery_list_label[^>]*>([\s\S]*?)<\/div>/.exec(card);
    const parsedVariant = variantMatch ? decodeHtmlText(variantMatch[1] as string) : "";
    const variant = /^(?:HOT|ICE)$/i.test(parsedVariant) ? parsedVariant.toUpperCase() : "NONE";
    const rawName = decodeHtmlText(nameMatch[1] as string);
    const name = rawName.replace(/^\((?:HOT|ICE)\)\s*/i, "").trim();
    if (!name) continue;
    const imageMatch = /<img\s+[^>]*src="([^"]+)"/i.exec(card);
    const englishMatch =
      /cont_text_inner[^>]*cont_text_info[^>]*>[\s\S]*?<div\s+class="text text1">([\s\S]*?)<\/div>/.exec(
        card
      );
    const descriptionMatch =
      /<div\s+class="cont_text cont_text_info">[\s\S]*?<div\s+class="text text2">([\s\S]*?)<\/div>/.exec(
        card
      );
    const externalId = megaMenuExternalId(category, name, variant);
    records.set(externalId, {
      externalId,
      brand: "메가MGC커피",
      name,
      englishName: englishMatch ? decodeHtmlText(englishMatch[1] as string) || null : null,
      category,
      variant,
      description: descriptionMatch ? decodeHtmlText(descriptionMatch[1] as string) || null : null,
      imageUrl: imageMatch ? decodeHtmlText(imageMatch[1] as string) || null : null,
      source: MEGA_MENU_SOURCE,
      sourceUrl: MEGA_MENU_SOURCE_URL
    });
  }
  return [...records.values()];
}

export async function fetchMegaMenus(fetcher: typeof fetch = fetch): Promise<MegaMenuRecord[]> {
  const menus = new Map<string, MegaMenuRecord>();
  for (const source of categorySources) {
    for (let page = 1; page <= 50; page += 1) {
      const url = new URL(menuUrl);
      url.searchParams.set("page", String(page));
      url.searchParams.set("menu_category1", source.officialId);
      url.searchParams.set("menu_category2", source.officialId);
      url.searchParams.set("category", "");
      url.searchParams.set("list_checkbox_all", "all");
      const response = await fetcher(url, {
        headers: {
          accept: "text/html",
          "user-agent": "WishMatch official Mega menu sync/1.0"
        },
        signal: AbortSignal.timeout(15_000)
      });
      if (!response.ok) {
        throw new Error(
          `메가MGC커피 메뉴 조회 실패 (${source.category} ${page}페이지: ${response.status})`
        );
      }
      const records = parseMegaMenuHtml(await response.text(), source.category);
      for (const menu of records) menus.set(menu.externalId, menu);
      if (records.length < pageSize) break;
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
  }

  const records = [...menus.values()].sort(
    (left, right) =>
      left.category.localeCompare(right.category) ||
      left.name.localeCompare(right.name, "ko") ||
      left.variant.localeCompare(right.variant)
  );
  if (records.length < 180) {
    throw new Error(
      `공식 메뉴 응답이 예상보다 적습니다 (${records.length}개). 동기화를 중단합니다.`
    );
  }
  return records;
}
