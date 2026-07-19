import { z } from "zod";

export const createInquirySchema = z.object({
  body: z
    .object({
      category: z.enum(["SERVICE", "ACCOUNT", "MODERATION", "PAYMENT", "OTHER"]),
      content: z.string().trim().min(10).max(500)
    })
    .strict()
});

export const inquiryListSchema = z.object({
  query: z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20)
    })
    .strict()
});

export type CreateInquiryInput = z.infer<typeof createInquirySchema>["body"];
