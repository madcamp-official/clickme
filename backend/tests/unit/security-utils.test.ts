import { describe, expect, it } from "vitest";
import { safeEqual, sha256 } from "../../src/common/utils/crypto.js";
import { nicknameCandidate, normalizeNickname } from "../../src/common/utils/nickname.js";
import { isOpenChatUrl } from "../../src/common/utils/url.js";

describe("security helpers", () => {
  it("accepts only the exact HTTPS open.kakao.com host", () => {
    expect(isOpenChatUrl("https://open.kakao.com/o/abc")).toBe(true);
    expect(isOpenChatUrl("http://open.kakao.com/o/abc")).toBe(false);
    expect(isOpenChatUrl("https://open.kakao.com.evil.example/o/abc")).toBe(false);
  });
  it("hashes refresh tokens and compares OAuth states", () => {
    expect(sha256("secret")).toHaveLength(64);
    expect(safeEqual("same", "same")).toBe(true);
    expect(safeEqual("same", "different")).toBe(false);
  });
  it("creates a 2-20 character service nickname", () => {
    expect(normalizeNickname("   ")).toBe("위시메이트");
    expect(nicknameCandidate("아주아주아주아주긴닉네임", "123456").length).toBeLessThanOrEqual(20);
  });
});
