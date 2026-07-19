import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to seed the database.");

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main(): Promise<void> {
  await prisma.event.upsert({
    where: { id: "sample-wish-match-event" },
    create: {
      id: "sample-wish-match-event",
      title: "WISH MATCH 샘플 이벤트",
      description: "개발 및 화면 확인용 WISH MATCH 이벤트입니다.",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2030-12-31T23:59:59.000Z"),
      isActive: true
    },
    update: { isActive: true }
  });
}

await main();
await prisma.$disconnect();
await pool.end();
