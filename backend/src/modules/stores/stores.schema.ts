import { z } from "zod";

export const storeIdSchema = z.object({ params: z.object({ id: z.string().min(1) }).strict() });
export const storeListSchema = z.object({
  query: z
    .object({
      region: z.string().trim().min(1).optional(),
      keyword: z.string().trim().min(1).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20)
    })
    .strict()
});
export const storeMenuListSchema = z.object({
  params: z.object({ id: z.string().min(1) }).strict(),
  query: z
    .object({
      category: z.enum(["DRINK", "FOOD", "PRODUCT"]).optional(),
      keyword: z.string().trim().min(1).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(300).default(300)
    })
    .strict()
});
export const createStoreSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(1).max(100),
      brand: z.string().trim().min(1).max(100).optional(),
      region: z.string().trim().min(1).max(100),
      district: z.string().trim().min(1).max(100).nullable().optional(),
      address: z.string().trim().min(1).max(300),
      phone: z.string().trim().min(1).max(30).nullable().optional(),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      isActive: z.boolean().optional()
    })
    .strict()
});
export const updateStoreSchema = z.object({
  params: z.object({ id: z.string().min(1) }).strict(),
  body: createStoreSchema.shape.body
    .partial()
    .refine((value) => Object.keys(value).length > 0)
    .strict()
});
