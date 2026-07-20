import { describe, expect, it } from "vitest";
import { megaMenuExternalId, parseMegaMenuHtml } from "../../src/modules/menus/mega-menu-source.js";

describe("official Mega menu source", () => {
  it("parses menu name, temperature, English name, and image", () => {
    const records = parseMegaMenuHtml(
      `
        <li>
          <a class="inner_modal_open">
            <div class="cont_gallery_list_img">
              <div class="cont_gallery_list_label cont_gallery_list_label2">ICE</div>
              <img src="https://img.79plus.co.kr/menu/americano.png">
            </div>
            <div class="cont_text_inner text_wrap cont_text_title"><b> 아메리카노 </b></div>
            <div class="cont_text_inner text_wrap cont_text_info">
              <div class="text text1">Americano</div>
            </div>
            <div class="cont_text cont_text_info">
              <div class="text_wrap"><div class="text text2">진하고 깔끔한 커피</div></div>
            </div>
          </a>
        </li>
      `,
      "DRINK"
    );

    expect(records).toEqual([
      expect.objectContaining({
        brand: "메가MGC커피",
        name: "아메리카노",
        englishName: "Americano",
        category: "DRINK",
        variant: "ICE",
        description: "진하고 깔끔한 커피",
        imageUrl: "https://img.79plus.co.kr/menu/americano.png",
        source: "MEGA_OFFICIAL"
      })
    ]);
    expect(records[0]?.externalId).toMatch(/^mega-menu-[a-f0-9]{24}$/);
  });

  it("keeps HOT and ICE variants as separate stable menu records", () => {
    expect(megaMenuExternalId("DRINK", "아메리카노", "HOT")).not.toBe(
      megaMenuExternalId("DRINK", "아메리카노", "ICE")
    );
    expect(megaMenuExternalId("FOOD", "마카롱", "NONE")).toBe(
      megaMenuExternalId("FOOD", " 마카롱 ", "none")
    );
  });
});
