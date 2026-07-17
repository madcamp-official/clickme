import { prisma } from "../../infrastructure/prisma/client.js";
import { AppError } from "../../common/errors/AppError.js";

export class HealthService {
  async check(): Promise<{ status: "ok"; database: "up"; timestamp: string; uptime: number }> {
    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error("database timeout")), 2000).unref();
        })
      ]);
    } catch {
      throw new AppError("DATABASE_ERROR", "데이터베이스 연결을 확인할 수 없습니다.", 503);
    }
    return {
      status: "ok",
      database: "up",
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  }
}
