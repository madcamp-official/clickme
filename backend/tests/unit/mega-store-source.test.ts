import { describe, expect, it } from "vitest";
import {
  megaStoreExternalId,
  normalizeStoreRegion,
  parseMegaStoreSearchHtml
} from "../../src/modules/stores/mega-store-source.js";

describe("official Mega store source", () => {
  it("parses official store search HTML into normalized store records", () => {
    const records = parseMegaStoreSearchHtml(`
      <li>
        <a onclick="panTo('서울 강남구 선릉로 660');">
          <div class="cont_text">
            <div class="cont_text_inner"><b> 강남보건소점 </b></div>
            <div class="cont_text_inner cont_text_info">
              서울 강남구 선릉로 660 (삼성동) 02-514-1218
            </div>
          </div>
        </a>
      </li>
    `);

    expect(records).toEqual([
      expect.objectContaining({
        brand: "메가MGC커피",
        name: "강남보건소점",
        region: "서울",
        district: "강남구",
        address: "서울 강남구 선릉로 660 (삼성동)",
        phone: "02-514-1218",
        source: "MEGA_OFFICIAL"
      })
    ]);
    expect(records[0]?.externalId).toMatch(/^mega-[a-f0-9]{24}$/);
  });

  it("normalizes old and new province names and creates stable IDs", () => {
    expect(normalizeStoreRegion("경상남도 창원시 성산구 중앙대로 1")).toBe("경남");
    expect(normalizeStoreRegion("전북특별자치도 전주시 완산구 홍산로 1")).toBe("전북");
    expect(normalizeStoreRegion("제주특별자치도 제주시 한림로 1")).toBe("제주");
    expect(megaStoreExternalId(" 협재점 ", "제주  제주시 한림로 1")).toBe(
      megaStoreExternalId("협재점", "제주 제주시 한림로 1")
    );
  });
});
