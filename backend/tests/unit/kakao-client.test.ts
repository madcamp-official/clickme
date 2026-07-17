import { afterEach, describe, expect, it, vi } from "vitest";
import { KakaoRestClient } from "../../src/infrastructure/kakao/kakao.client.js";

describe("Kakao REST client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves a Kakao member number larger than JS safe integer as a string", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            '{"id":90071992547409931234,"kakao_account":{"profile":{"nickname":"위시"}}}',
            { status: 200, headers: { "content-type": "application/json" } }
          )
        )
    );
    const profile = await new KakaoRestClient().fetchProfile("temporary-kakao-token");
    expect(profile.kakaoUserId).toBe("90071992547409931234");
    expect(profile.nickname).toBe("위시");
  });

  it("rejects an invalid external response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"unexpected":true}', { status: 200 }))
    );
    await expect(new KakaoRestClient().fetchProfile("temporary-kakao-token")).rejects.toMatchObject(
      {
        code: "KAKAO_RESPONSE_INVALID"
      }
    );
  });
});
