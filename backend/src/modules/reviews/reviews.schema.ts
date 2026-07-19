import { z } from "zod";

export const createReviewSchema = z.object({
  body: z
    .object({
      postId: z.string().min(1),
      rating: z.number().int().min(1).max(5),
      content: z.string().trim().min(10).max(500)
    })
    .strict()
});
export const reviewListSchema = z.object({
  params: z.object({ userId: z.string().min(1) }).strict(),
  query: z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20)
    })
    .strict()
});
export const myReviewListSchema = z.object({
  query: z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20)
    })
    .strict()
});
