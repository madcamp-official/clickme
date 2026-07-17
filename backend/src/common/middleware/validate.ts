import type { RequestHandler } from "express";
import type { z } from "zod";
import { AppError } from "../errors/AppError.js";

export const validate =
  (schema: z.ZodType): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse({
      body: req.body as unknown,
      query: req.query,
      params: req.params
    });
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message
      }));
      next(new AppError("VALIDATION_ERROR", "요청 값을 확인해 주세요.", 400, details));
      return;
    }
    const validated = result.data as { body?: unknown; query?: unknown; params?: unknown };
    if (validated.body !== undefined) req.body = validated.body;
    if (validated.query !== undefined) req.query = validated.query as typeof req.query;
    if (validated.params !== undefined) req.params = validated.params as typeof req.params;
    next();
  };
