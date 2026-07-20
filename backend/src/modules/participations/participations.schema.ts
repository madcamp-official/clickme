import { z } from "zod";

export const createParticipationSchema = z.object({
  params: z.object({ postId: z.string().min(1) }).strict(),
  body: z
    .object({
      quantity: z.number().int().min(1).max(30),
      pickupStoreId: z.string().min(1),
      menuId: z.string().min(1)
    })
    .strict()
});

export const participationIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }).strict()
});

export const participationListSchema = z.object({
  query: z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20)
    })
    .strict()
});

export type CreateParticipationInput = z.infer<typeof createParticipationSchema>["body"];
