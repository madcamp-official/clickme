import { z } from "zod";
import { createEventSchema, eventUpdateBodySchema } from "../events/events.schema.js";
import { createStoreSchema } from "../stores/stores.schema.js";

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
};
const idParams = z.object({ id: z.string().min(1) }).strict();

export const ADMIN_DATABASE_TABLES = [
  "users",
  "posts",
  "participations",
  "purchaseRequests",
  "stores",
  "menus",
  "storeMenus",
  "events",
  "inquiries",
  "reviews",
  "favorites",
  "reports",
  "notifications",
  "adminActions"
] as const;

export type AdminDatabaseTable = (typeof ADMIN_DATABASE_TABLES)[number];

export const adminIdSchema = z.object({ params: idParams });
export const adminReportsSchema = z.object({
  query: z
    .object({ ...pagination, status: z.enum(["PENDING", "RESOLVED", "REJECTED"]).optional() })
    .strict()
});
export const adminDatabaseSchema = z.object({
  query: z
    .object({
      table: z.enum(ADMIN_DATABASE_TABLES),
      ...pagination,
      search: z.string().trim().min(1).max(100).optional()
    })
    .strict()
});
export const handleReportSchema = z.object({
  params: idParams,
  body: z
    .object({
      status: z.enum(["RESOLVED", "REJECTED"]),
      adminNote: z.string().trim().min(1).max(1000)
    })
    .strict()
});
export const adminUsersSchema = z.object({
  query: z
    .object({
      ...pagination,
      status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
      role: z.enum(["USER", "ADMIN"]).optional(),
      keyword: z.string().trim().min(1).optional()
    })
    .strict()
});
export const suspendSchema = z.object({
  params: idParams,
  body: z.object({ reason: z.string().trim().min(1).max(1000) }).strict()
});
export const unsuspendSchema = z.object({
  params: idParams,
  body: z.object({ reason: z.string().trim().max(1000).optional() }).strict()
});
export const adminPostsSchema = z.object({
  query: z
    .object({
      ...pagination,
      deleted: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional()
    })
    .strict()
});
export const adminDeletePostSchema = z.object({
  params: idParams,
  body: z.object({ reason: z.string().trim().min(1).max(1000) }).strict()
});
export const adminRestorePostSchema = z.object({
  params: idParams,
  body: z.object({ reason: z.string().trim().max(1000).optional() }).strict()
});
export const adminCreateStoreSchema = createStoreSchema;
export const adminUpdateStoreSchema = z.object({
  params: idParams,
  body: createStoreSchema.shape.body
    .partial()
    .refine((value) => Object.keys(value).length > 0)
    .strict()
});
export const adminStoreMenusSchema = z.object({
  params: idParams,
  query: z
    .object({
      ...pagination,
      category: z.enum(["DRINK", "FOOD", "PRODUCT"]).optional(),
      keyword: z.string().trim().min(1).optional()
    })
    .strict()
});
export const adminUpdateStoreMenuSchema = z.object({
  params: z.object({ storeId: z.string().min(1), menuId: z.string().min(1) }).strict(),
  body: z.object({ availability: z.enum(["AVAILABLE", "UNAVAILABLE"]) }).strict()
});
export const adminCreateEventSchema = createEventSchema;
export const adminUpdateEventSchema = z.object({
  params: idParams,
  body: eventUpdateBodySchema
});
