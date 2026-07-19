import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import {
  fetchMegaStores,
  MEGA_STORE_SOURCE
} from "../src/modules/stores/mega-store-source.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to sync stores.");

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
  const incoming = await fetchMegaStores();
  const syncedAt = new Date();
  const existing = await prisma.store.findMany({
    select: {
      id: true,
      brand: true,
      name: true,
      region: true,
      district: true,
      address: true,
      phone: true,
      source: true,
      externalId: true,
      sourceUrl: true,
      isActive: true
    }
  });
  const byExternalId = new Map(existing.flatMap((store) => (store.externalId ? [[store.externalId, store]] : [])));
  const byNameAddress = new Map(existing.map((store) => [`${store.name}\n${store.address}`, store]));
  const creates: Array<(typeof incoming)[number] & { id: string; isActive: true; lastSyncedAt: Date }> = [];
  const updates: Array<{ id: string; data: (typeof incoming)[number] & { isActive: true; lastSyncedAt: Date } }> = [];

  for (const store of incoming) {
    const current = byExternalId.get(store.externalId) ?? byNameAddress.get(`${store.name}\n${store.address}`);
    const data = { ...store, isActive: true as const, lastSyncedAt: syncedAt };
    if (!current) {
      creates.push({ id: randomUUID(), ...data });
      continue;
    }
    if (
      current.brand !== store.brand ||
      current.name !== store.name ||
      current.region !== store.region ||
      current.district !== store.district ||
      current.address !== store.address ||
      current.phone !== store.phone ||
      current.source !== store.source ||
      current.externalId !== store.externalId ||
      current.sourceUrl !== store.sourceUrl ||
      !current.isActive
    ) {
      updates.push({ id: current.id, data });
    }
  }

  for (const batch of chunks(creates, 500)) {
    await prisma.store.createMany({ data: batch });
  }
  for (const batch of chunks(updates, 25)) {
    await Promise.all(
      batch.map(({ id, data }) => prisma.store.update({ where: { id }, data }))
    );
  }
  const deactivated = await prisma.store.updateMany({
    where: {
      source: MEGA_STORE_SOURCE,
      externalId: { notIn: incoming.map((store) => store.externalId) },
      isActive: true
    },
    data: { isActive: false, lastSyncedAt: syncedAt }
  });

  console.log(
    JSON.stringify(
      {
        source: MEGA_STORE_SOURCE,
        fetched: incoming.length,
        created: creates.length,
        updated: updates.length,
        deactivated: deactivated.count,
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
