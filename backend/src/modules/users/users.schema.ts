import { z } from "zod";

export const userIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }).strict()
});

export const updateMeSchema = z.object({
  body: z.object({ nickname: z.string().trim().min(2).max(20) }).strict()
});

export const userListSchema = z.object({
  params: z.object({ id: z.string().min(1) }).strict(),
  query: z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20)
    })
    .strict()
});
