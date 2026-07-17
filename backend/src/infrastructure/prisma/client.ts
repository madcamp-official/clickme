import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";

export const pgPool = new Pool({ connectionString: env.DATABASE_URL });
const adapter = new PrismaPg(pgPool);
export const prisma = new PrismaClient({ adapter });

export async function closeDatabase(): Promise<void> {
  await prisma.$disconnect();
  await pgPool.end();
}
