import { z } from "zod";

export const createReportSchema = z.object({
  body: z
    .object({
      targetPostId: z.string().min(1),
      reason: z.enum(["FRAUD", "NO_SHOW", "ABUSE", "OTHER"]),
      detail: z.string().trim().min(1).max(1000).optional()
    })
    .strict()
    .refine((value) => value.reason !== "OTHER" || Boolean(value.detail), {
      path: ["detail"],
      message: "OTHER 사유에는 상세 내용이 필요합니다."
    })
});
