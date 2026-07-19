import { z } from "zod";
import { isOpenChatUrl } from "../../common/utils/url.js";

const body = z
  .object({
    city: z.string().trim().min(1).max(50),
    branch: z.string().trim().min(1).max(100),
    menu: z.string().trim().min(1).max(200),
    quantity: z.number().int().min(1).max(30),
    desiredTime: z.string().trim().min(1).max(100),
    note: z.string().trim().max(500).nullable().optional(),
    openChatUrl: z.url().refine(isOpenChatUrl, "open.kakao.com의 HTTPS URL만 사용할 수 있습니다.")
  })
  .strict();

export const createPurchaseRequestSchema = z.object({ body });
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
export type PurchaseRequestListInput = z.infer<typeof purchaseRequestListSchema>["query"];
