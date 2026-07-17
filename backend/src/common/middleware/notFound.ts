import type { RequestHandler } from "express";
import { AppError } from "../errors/AppError.js";

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError("RESOURCE_NOT_FOUND", "요청한 경로를 찾을 수 없습니다.", 404));
};
