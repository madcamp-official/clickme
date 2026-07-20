import { z } from "zod";

export const notificationListSchema = z.object({
  query: z
    .object({
      unreadOnly: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .default(false),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50)
    })
    .strict()
});
export const notificationIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }).strict()
});
