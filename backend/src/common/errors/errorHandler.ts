import type { ErrorRequestHandler } from "express";
import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "./AppError.js";

function fromPrisma(error: Prisma.PrismaClientKnownRequestError): AppError {
  if (error.code === "P2002") {
    const target = JSON.stringify(error.meta?.target ?? "");
    const model = typeof error.meta?.modelName === "string" ? error.meta.modelName : "";
    if (model === "User" && target.includes("nickname")) {
      return new AppError("NICKNAME_ALREADY_EXISTS", "이미 사용 중인 닉네임입니다.", 409);
    }
    if (model === "Review") {
      return new AppError("REVIEW_ALREADY_EXISTS", "이미 후기를 작성했습니다.", 409);
    }
    if (model === "Participation") {
      return new AppError("PARTICIPATION_ALREADY_EXISTS", "이미 참여한 모집입니다.", 409);
    }
    if (model === "Report") {
      return new AppError("REPORT_ALREADY_EXISTS", "이미 같은 사유로 신고했습니다.", 409);
    }
    return new AppError("VALIDATION_ERROR", "이미 존재하는 값입니다.", 409);
  }
  if (error.code === "P2025") {
    return new AppError("RESOURCE_NOT_FOUND", "요청한 리소스를 찾을 수 없습니다.", 404);
  }
  return new AppError("DATABASE_ERROR", "데이터 처리 중 오류가 발생했습니다.", 500);
}

export const errorHandler: ErrorRequestHandler = (rawError, req, res, next) => {
  void next;
  const unknownError = rawError as unknown;
  let error: unknown = unknownError;
  if (unknownError instanceof Prisma.PrismaClientKnownRequestError)
    error = fromPrisma(unknownError);
  const appError =
    error instanceof AppError
      ? error
      : new AppError("INTERNAL_SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
  if (appError.statusCode >= 500) req.log.error({ err: unknownError }, "request failed");
  res.status(appError.statusCode).json({
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details,
      requestId: req.id
    }
  });
};
