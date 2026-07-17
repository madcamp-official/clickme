import { describe, expect, it } from "vitest";
import { createPostSchema, postListSchema } from "../../src/modules/posts/posts.schema.js";
import { createReportSchema } from "../../src/modules/reports/reports.schema.js";

const validPost = {
  storeId: "store",
  discount: 20,
  totalCount: 5,
  remainCount: 5,
  meetingTime: "2030-01-01T10:00:00.000Z",
  meetingPlace: "강남역",
  openChatUrl: "https://open.kakao.com/o/example"
};

describe("request schemas", () => {
  it("rejects remainCount greater than totalCount", () => {
    expect(createPostSchema.safeParse({ body: { ...validPost, remainCount: 6 } }).success).toBe(
      false
    );
  });
  it("rejects non-Kakao chat URLs and unknown fields", () => {
    expect(
      createPostSchema.safeParse({
        body: { ...validPost, openChatUrl: "https://example.com", extra: true }
      }).success
    ).toBe(false);
  });
  it("coerces and bounds pagination", () => {
    const parsed = postListSchema.parse({ query: { page: "2", limit: "100", sort: "latest" } });
    expect(parsed.query.page).toBe(2);
    expect(postListSchema.safeParse({ query: { limit: "101" } }).success).toBe(false);
  });
  it("requires detail for OTHER reports", () => {
    expect(
      createReportSchema.safeParse({ body: { targetPostId: "p", reason: "OTHER" } }).success
    ).toBe(false);
  });
});
