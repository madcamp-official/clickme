import { createHash } from "node:crypto";

export const MEGA_STORE_SOURCE = "MEGA_OFFICIAL";
export const MEGA_STORE_SOURCE_URL = "https://www.mega-mgccoffee.com/store/find/";

const searchUrl = "https://www.mega-mgccoffee.com/store/find/store_search.php";
const searchTerms = [
  "서울",
  "경기",
  "인천",
  "강원",
  "광주",
  "대전",
  "대구",
  "부산",
  "울산",
  "세종",
  "경남",
  "경상남도",
  "경북",
  "경상북도",
  "전남",
  "전라남도",
  "전북",
  "전라북도",
  "충남",
  "충청남도",
  "충북",
  "충청북도",
  "제주"
] as const;

const regionPrefixes: Array<{ region: string; prefixes: string[] }> = [
  { region: "서울", prefixes: ["서울"] },
  { region: "경기", prefixes: ["경기"] },
  { region: "인천", prefixes: ["인천"] },
  { region: "강원", prefixes: ["강원"] },
  { region: "광주", prefixes: ["광주"] },
  { region: "대전", prefixes: ["대전"] },
  { region: "대구", prefixes: ["대구"] },
  { region: "부산", prefixes: ["부산"] },
  { region: "울산", prefixes: ["울산"] },
  { region: "세종", prefixes: ["세종"] },
  { region: "경남", prefixes: ["경남", "경상남"] },
  { region: "경북", prefixes: ["경북", "경상북"] },
  { region: "전남", prefixes: ["전남", "전라남"] },
  { region: "전북", prefixes: ["전북", "전라북"] },
  { region: "충남", prefixes: ["충남", "충청남"] },
  { region: "충북", prefixes: ["충북", "충청북"] },
  { region: "제주", prefixes: ["제주"] }
];

export interface MegaStoreRecord {
  externalId: string;
  brand: "메가MGC커피";
  name: string;
  region: string;
  district: string | null;
  address: string;
  phone: string | null;
  source: typeof MEGA_STORE_SOURCE;
  sourceUrl: typeof MEGA_STORE_SOURCE_URL;
}

function decodeHtmlText(value: string): string {
  return value
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

export function normalizeStoreRegion(address: string): string | null {
  return (
    regionPrefixes.find(({ prefixes }) => prefixes.some((prefix) => address.startsWith(prefix)))
      ?.region ?? null
  );
}

function storeDistrict(address: string, region: string): string | null {
  if (region === "세종") return "세종시";
  return address.split(/\s+/)[1]?.replace(/,$/, "") ?? null;
}

export function megaStoreExternalId(name: string, address: string): string {
  const normalized = `${name.trim().toLowerCase()}\n${address.trim().toLowerCase()}`.replace(
    /\s+/g,
    " "
  );
  return `mega-${createHash("sha256").update(normalized).digest("hex").slice(0, 24)}`;
}

export function parseMegaStoreSearchHtml(html: string): MegaStoreRecord[] {
  const records: MegaStoreRecord[] = [];
  for (const match of html.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
    const item = match[1] as string;
    const nameMatch = /<b>([\s\S]*?)<\/b>/.exec(item);
    const infoMatch = /<div class="cont_text_inner cont_text_info">([\s\S]*?)<\/div>/.exec(
      item
    );
    if (!nameMatch || !infoMatch) continue;

    const name = decodeHtmlText(nameMatch[1] as string);
    let address = decodeHtmlText(infoMatch[1] as string);
    const phone = /(?:\d{2,4}-)?\d{3,4}-\d{4}$/.exec(address)?.[0] ?? null;
    if (phone) address = address.slice(0, -phone.length).trim();
    const region = normalizeStoreRegion(address);
    if (!name || !address || !region) continue;

    records.push({
      externalId: megaStoreExternalId(name, address),
      brand: "메가MGC커피",
      name,
      region,
      district: storeDistrict(address, region),
      address,
      phone,
      source: MEGA_STORE_SOURCE,
      sourceUrl: MEGA_STORE_SOURCE_URL
    });
  }
  return records;
}

export async function fetchMegaStores(fetcher: typeof fetch = fetch): Promise<MegaStoreRecord[]> {
  const stores = new Map<string, MegaStoreRecord>();
  for (const term of searchTerms) {
    const url = new URL(searchUrl);
    url.searchParams.set("store_search", term);
    const response = await fetcher(url, {
      headers: {
        accept: "text/html",
        "user-agent": "WishMatch official Mega store sync/1.0"
      },
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error(`메가MGC커피 매장 검색 실패 (${term}: ${response.status})`);
    for (const store of parseMegaStoreSearchHtml(await response.text())) {
      stores.set(store.externalId, store);
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }

  const records = [...stores.values()].sort(
    (left, right) =>
      left.region.localeCompare(right.region, "ko") || left.name.localeCompare(right.name, "ko")
  );
  if (records.length < 4_000) {
    throw new Error(`공식 매장 응답이 예상보다 적습니다 (${records.length}개). 동기화를 중단합니다.`);
  }
  return records;
}
