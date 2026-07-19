import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validate } from "../../src/common/middleware/validate.js";

describe("validate middleware", () => {
  it("exposes coerced query values on Express 5 requests", async () => {
    const app = express();
    const schema = z.object({
      query: z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          active: z
            .enum(["true", "false"])
            .transform((value) => value === "true")
            .optional()
        })
        .strict()
    });

    app.get("/items", validate(schema), (req, res) => {
      res.json({ page: req.query.page, active: req.query.active });
    });

    const response = await request(app).get("/items?page=2&active=true").expect(200);
    expect(response.body).toEqual({ page: 2, active: true });
  });
});
