import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  },
  datasource: {
    // Generate/build must not require a production secret. Migration commands still use DIRECT_URL when set.
    url: process.env.DIRECT_URL || "postgresql://invalid:invalid@127.0.0.1:5432/invalid"
  }
});
