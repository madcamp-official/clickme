import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { fetchMegaMenus, MEGA_MENU_SOURCE } from "../src/modules/menus/mega-menu-source.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to sync menus.");

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function main(): Promise<void> {
  const incoming = await fetchMegaMenus();
  const syncedAt = new Date();
  const existing = await prisma.menu.findMany({
    select: {
      id: true,
      externalId: true,
      brand: true,
      name: true,
      englishName: true,
      category: true,
      variant: true,
      description: true,
      imageUrl: true,
      source: true,
      sourceUrl: true,
      isActive: true
    }
  });
  const byExternalId = new Map(existing.map((menu) => [menu.externalId, menu]));
  const byIdentity = new Map(
    existing.map((menu) => [`${menu.brand}\n${menu.category}\n${menu.name}\n${menu.variant}`, menu])
  );
  const creates: Array<
    (typeof incoming)[number] & { id: string; isActive: true; lastSyncedAt: Date }
  > = [];
  const updates: Array<{
    id: string;
    data: (typeof incoming)[number] & { isActive: true; lastSyncedAt: Date };
  }> = [];

  for (const menu of incoming) {
    const identity = `${menu.brand}\n${menu.category}\n${menu.name}\n${menu.variant}`;
    const current = byExternalId.get(menu.externalId) ?? byIdentity.get(identity);
    const data = { ...menu, isActive: true as const, lastSyncedAt: syncedAt };
    if (!current) {
      creates.push({ id: randomUUID(), ...data });
      continue;
    }
    if (
      current.externalId !== menu.externalId ||
      current.brand !== menu.brand ||
      current.name !== menu.name ||
      current.englishName !== menu.englishName ||
      current.category !== menu.category ||
      current.variant !== menu.variant ||
      current.description !== menu.description ||
      current.imageUrl !== menu.imageUrl ||
      current.source !== menu.source ||
      current.sourceUrl !== menu.sourceUrl ||
      !current.isActive
    ) {
      updates.push({ id: current.id, data });
    }
  }

  for (const batch of chunks(creates, 250)) {
    await prisma.menu.createMany({ data: batch });
  }
  for (const batch of chunks(updates, 25)) {
    await Promise.all(batch.map(({ id, data }) => prisma.menu.update({ where: { id }, data })));
  }
  await prisma.menu.updateMany({
    where: { externalId: { in: incoming.map((menu) => menu.externalId) } },
    data: { lastSyncedAt: syncedAt }
  });
  const deactivated = await prisma.menu.updateMany({
    where: {
      source: MEGA_MENU_SOURCE,
      externalId: { notIn: incoming.map((menu) => menu.externalId) },
      isActive: true
    },
    data: { isActive: false, lastSyncedAt: syncedAt }
  });

  console.log(
    JSON.stringify(
      {
        source: MEGA_MENU_SOURCE,
        fetched: incoming.length,
        created: creates.length,
        updated: updates.length,
        deactivated: deactivated.count,
        defaultAvailability: "AVAILABLE",
        syncedAt: syncedAt.toISOString()
      },
      null,
      2
    )
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
  await pool.end();
}
