import { z } from "zod";

const eventBodyBase = z
  .object({
    title: z.string().trim().min(1).max(150),
    description: z.string().trim().max(2000).optional(),
    startDate: z.iso.datetime().transform((value) => new Date(value)),
    endDate: z.iso.datetime().transform((value) => new Date(value)),
    bannerImage: z.url().optional(),
    isActive: z.boolean().optional()
  })
  .strict();

const eventBody = eventBodyBase.refine((value) => value.startDate < value.endDate, {
  path: ["endDate"],
  message: "종료일은 시작일보다 늦어야 합니다."
});

export const eventIdSchema = z.object({ params: z.object({ id: z.string().min(1) }).strict() });
export const eventListSchema = z.object({
  query: z
    .object({
      active: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20)
    })
    .strict()
});
export const createEventSchema = z.object({ body: eventBody });
export const eventUpdateBodySchema = eventBodyBase
  .partial()
  .refine((value) => Object.keys(value).length > 0)
  .refine((value) => !value.startDate || !value.endDate || value.startDate < value.endDate, {
    path: ["endDate"],
    message: "종료일은 시작일보다 늦어야 합니다."
  });
export const updateEventSchema = z.object({
  params: z.object({ id: z.string().min(1) }).strict(),
  body: eventUpdateBodySchema
});
