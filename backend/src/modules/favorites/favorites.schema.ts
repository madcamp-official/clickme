import { z } from "zod";

export const favoritePostSchema = z.object({
  params: z.object({ postId: z.string().min(1) }).strict()
});
export const favoritesListSchema = z.object({
  query: z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20)
    })
    .strict()
});
