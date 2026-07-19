import { describe, expect, it } from "vitest";
import {
  createPostSchema,
  postListSchema,
  updatePostSchema
} from "../../src/modules/posts/posts.schema.js";
import { createReviewSchema } from "../../src/modules/reviews/reviews.schema.js";
import { createReportSchema } from "../../src/modules/reports/reports.schema.js";
import { createParticipationSchema } from "../../src/modules/participations/participations.schema.js";
import { createPurchaseRequestSchema } from "../../src/modules/purchase-requests/purchase-requests.schema.js";
import { createInquirySchema } from "../../src/modules/inquiries/inquiries.schema.js";
import { updateProfileImageSchema } from "../../src/modules/users/users.schema.js";

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
  it("accepts supported post image attachments and rejects conflicting image sources", () => {
    const imageData = "data:image/jpeg;base64,/9j/2Q==";
    expect(createPostSchema.safeParse({ body: { ...validPost, imageData } }).success).toBe(true);
    expect(
      createPostSchema.safeParse({
        body: { ...validPost, imageData, imageUrl: "https://example.com/photo.jpg" }
      }).success
    ).toBe(false);
    expect(
      updatePostSchema.safeParse({
        params: { id: "post" },
        body: { imageData: "data:image/svg+xml;base64,PHN2Zz4=" }
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
  it("validates participation quantity and pickup store", () => {
    expect(
      createParticipationSchema.safeParse({
        params: { postId: "post" },
        body: { quantity: 2, pickupStore: "홍대점" }
      }).success
    ).toBe(true);
    expect(
      createParticipationSchema.safeParse({
        params: { postId: "post" },
        body: { quantity: 0, pickupStore: "" }
      }).success
    ).toBe(false);
  });
  it("accepts only Kakao open chat links for purchase requests", () => {
    const request = {
      city: "서울",
      branch: "홍대점",
      menu: "아메리카노 1잔",
      quantity: 1,
      desiredTime: "오늘 오후",
      openChatUrl: "https://open.kakao.com/o/example"
    };
    expect(createPurchaseRequestSchema.safeParse({ body: request }).success).toBe(true);
    expect(
      createPurchaseRequestSchema.safeParse({
        body: { ...request, openChatUrl: "https://example.com/chat" }
      }).success
    ).toBe(false);
  });
  it("validates inquiry categories and minimum content length", () => {
    expect(
      createInquirySchema.safeParse({
        body: { category: "SERVICE", content: "서비스 이용 중 문제가 발생했습니다." }
      }).success
    ).toBe(true);
    expect(
      createInquirySchema.safeParse({ body: { category: "UNKNOWN", content: "짧음" } }).success
    ).toBe(false);
  });
  it("requires meaningful review content", () => {
    expect(
      createReviewSchema.safeParse({
        body: { postId: "post", rating: 5, content: "정말 친절하고 수령도 편했어요." }
      }).success
    ).toBe(true);
    expect(
      createReviewSchema.safeParse({ body: { postId: "post", rating: 5, content: "좋아요" } })
        .success
    ).toBe(false);
  });
  it("accepts only supported profile image data URLs", () => {
    expect(
      updateProfileImageSchema.safeParse({
        body: { imageData: "data:image/jpeg;base64,/9j/2Q==" }
      }).success
    ).toBe(true);
    expect(
      updateProfileImageSchema.safeParse({
        body: { imageData: "data:image/svg+xml;base64,PHN2Zz4=" }
      }).success
    ).toBe(false);
  });
});
