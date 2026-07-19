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
    if (validated.query !== undefined) {
      // Express 5 exposes req.query through a getter without a setter. Define an
      // own property so controllers receive Zod's coerced/defaulted query values.
      Object.defineProperty(req, "query", {
        value: validated.query,
        writable: true,
        enumerable: true,
        configurable: true
      });
    }
    if (validated.params !== undefined) req.params = validated.params as typeof req.params;
    next();
  };
