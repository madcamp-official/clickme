import type { RequestHandler } from "express";
import type { UserRole } from "../../generated/prisma/enums.js";
import { AppError } from "../errors/AppError.js";

export const authorize =
  (...roles: UserRole[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      next(new AppError("FORBIDDEN", "접근 권한이 없습니다.", 403));
      return;
    }
    next();
  };
