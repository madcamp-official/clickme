import { z } from "zod";

export const userIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }).strict()
});

export const updateMeSchema = z.object({
  body: z.object({ nickname: z.string().trim().min(2).max(20) }).strict()
});

export const updateProfileImageSchema = z.object({
  body: z
    .object({
      imageData: z
        .string()
        .max(95_000)
        .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
    })
    .strict()
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

export const myListSchema = z.object({
  query: z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20)
    })
    .strict()
});
