import { z } from "zod";
import { isOpenChatUrl } from "../../common/utils/url.js";

const purchaseRequestFields = {
  storeId: z.string().min(1),
  menuId: z.string().min(1),
  quantity: z.number().int().min(1).max(30),
  desiredTime: z.string().trim().min(1).max(100),
  note: z.string().trim().max(500).nullable().optional(),
  openChatUrl: z.url().refine(isOpenChatUrl, "open.kakao.com의 HTTPS URL만 사용할 수 있습니다.")
};

const body = z.object(purchaseRequestFields).strict();

export const createPurchaseRequestSchema = z.object({ body });
export const updatePurchaseRequestSchema = z.object({
  params: z.object({ id: z.string().min(1) }).strict(),
  body: z
    .object(purchaseRequestFields)
    .partial()
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
      message: "수정할 내용을 한 개 이상 입력해주세요."
    })
    .refine(
      (value) =>
        (value.storeId === undefined && value.menuId === undefined) ||
        (value.storeId !== undefined && value.menuId !== undefined),
      { message: "매장과 메뉴는 함께 변경해주세요.", path: ["menuId"] }
    )
});
export const purchaseRequestIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }).strict()
});
export const purchaseRequestListSchema = z.object({
  query: z
    .object({
      status: z.enum(["OPEN", "ACCEPTED", "CANCELLED"]).optional(),
      city: z.string().trim().min(1).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20)
    })
    .strict()
});

export type CreatePurchaseRequestInput = z.infer<typeof body>;
export type UpdatePurchaseRequestInput = z.infer<typeof updatePurchaseRequestSchema>["body"];
export type PurchaseRequestListInput = z.infer<typeof purchaseRequestListSchema>["query"];
