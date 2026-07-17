import cors from "cors";
import { env } from "./env.js";
import { AppError } from "../common/errors/AppError.js";

export const corsMiddleware = cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new AppError("FORBIDDEN", "허용되지 않은 요청 출처입니다.", 403));
  }
});
