import type { RequestHandler } from "express";
import { AppError } from "../errors/AppError.js";

export const requireActiveUser: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    next(new AppError("UNAUTHORIZED", "로그인이 필요합니다.", 401));
    return;
  }
  next();
};
