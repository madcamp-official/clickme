import type { ErrorCode } from "./errorCodes.js";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly details: unknown = null
  ) {
    super(message);
    this.name = "AppError";
  }
}
