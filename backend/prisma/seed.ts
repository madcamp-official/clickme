import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to seed the database.");

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main(): Promise<void> {
  const stores = [
    { name: "샘플 강남점", region: "서울", address: "서울 강남구 샘플로 1" },
    { name: "샘플 홍대점", region: "서울", address: "서울 마포구 샘플로 2" },
    { name: "샘플 부산점", region: "부산", address: "부산 부산진구 샘플로 3" }
  ];
  for (const store of stores) {
    await prisma.store.upsert({
      where: { name_address: { name: store.name, address: store.address } },
      create: store,
      update: { region: store.region }
    });
  }
  await prisma.event.upsert({
    where: { id: "sample-wish-match-event" },
    create: {
      id: "sample-wish-match-event",
      title: "WISH MATCH 샘플 이벤트",
      description: "개발 및 화면 확인용 샘플 데이터입니다.",
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
