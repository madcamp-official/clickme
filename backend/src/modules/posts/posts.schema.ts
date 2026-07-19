import { z } from "zod";
import { isOpenChatUrl } from "../../common/utils/url.js";

const postFields = {
  storeId: z.string().min(1),
  eventId: z.string().min(1).nullable().optional(),
  discount: z.number().int().min(1).max(100),
  totalCount: z.number().int().min(1).max(100),
  remainCount: z.number().int().min(0).max(100),
  meetingTime: z.iso.datetime().transform((value) => new Date(value)),
  availableUntil: z.iso
    .datetime()
    .transform((value) => new Date(value))
    .optional(),
  meetingPlace: z.string().trim().min(1).max(300),
  openChatUrl: z.url().refine(isOpenChatUrl, "open.kakao.com의 HTTPS URL만 사용할 수 있습니다."),
  description: z.string().trim().max(2000).nullable().optional(),
  imageUrl: z.url().nullable().optional(),
  imageData: z
    .string()
    .max(430_000)
    .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
    .optional()
};

const hasSingleImageSource = (value: {
  imageData?: string | undefined;
  imageUrl?: string | null | undefined;
}) =>
  !(value.imageData && value.imageUrl !== undefined);

export const postIdSchema = z.object({ params: z.object({ id: z.string().min(1) }).strict() });
export const createPostSchema = z.object({
  body: z
    .object(postFields)
    .strict()
    .refine((value) => value.remainCount <= value.totalCount, {
      path: ["remainCount"],
      message: "남은 수량은 전체 수량 이하여야 합니다."
    })
    .refine((value) => !value.availableUntil || value.availableUntil > value.meetingTime, {
      path: ["availableUntil"],
      message: "가능 종료 시간은 시작 시간보다 늦어야 합니다."
    })
    .refine(hasSingleImageSource, {
      path: ["imageData"],
      message: "첨부 이미지와 이미지 URL을 동시에 지정할 수 없습니다."
    })
});
export const updatePostSchema = z.object({
  params: z.object({ id: z.string().min(1) }).strict(),
  body: z
    .object(postFields)
    .partial()
    .strict()
    .refine((value) => Object.keys(value).length > 0)
    .refine(
      (value) =>
        value.remainCount === undefined ||
        value.totalCount === undefined ||
        value.remainCount <= value.totalCount,
      { path: ["remainCount"], message: "남은 수량은 전체 수량 이하여야 합니다." }
    )
    .refine(
      (value) =>
        !value.meetingTime || !value.availableUntil || value.availableUntil > value.meetingTime,
      { path: ["availableUntil"], message: "가능 종료 시간은 시작 시간보다 늦어야 합니다." }
    )
    .refine(hasSingleImageSource, {
      path: ["imageData"],
      message: "첨부 이미지와 이미지 URL을 동시에 지정할 수 없습니다."
    })
});
export const remainCountSchema = z.object({
  params: z.object({ id: z.string().min(1) }).strict(),
  body: z.object({ remainCount: z.number().int().min(0).max(100) }).strict()
});
export const postListSchema = z.object({
  query: z
    .object({
      region: z.string().trim().min(1).optional(),
      storeId: z.string().min(1).optional(),
      storeName: z.string().trim().min(1).optional(),
      minDiscount: z.coerce.number().int().min(1).max(100).optional(),
      maxDiscount: z.coerce.number().int().min(1).max(100).optional(),
      minRemainCount: z.coerce.number().int().min(0).max(100).optional(),
      status: z.enum(["OPEN", "CLOSED"]).optional(),
      eventId: z.string().min(1).optional(),
      meetingFrom: z.iso
        .datetime()
        .transform((value) => new Date(value))
        .optional(),
      meetingTo: z.iso
        .datetime()
        .transform((value) => new Date(value))
        .optional(),
      sort: z.enum(["latest", "meetingSoon", "discountHigh", "remainLow"]).default("latest"),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20)
    })
    .strict()
    .refine(
      (value) =>
        value.minDiscount === undefined ||
        value.maxDiscount === undefined ||
        value.minDiscount <= value.maxDiscount,
      { path: ["maxDiscount"], message: "최대 할인율은 최소 할인율 이상이어야 합니다." }
    )
});

export type CreatePostInput = z.infer<typeof createPostSchema>["body"];
export type UpdatePostInput = z.infer<typeof updatePostSchema>["body"];
export type PostListInput = z.infer<typeof postListSchema>["query"];
