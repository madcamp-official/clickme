import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export const requestId: RequestHandler = (req, res, next) => {
  const received = req.get("x-request-id");
  req.id = received && received.length <= 100 ? received : randomUUID();
  res.setHeader("x-request-id", req.id);
  next();
};
