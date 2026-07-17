import { createServer } from "node:http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { closeDatabase } from "./infrastructure/prisma/client.js";

const server = createServer(app);
server.listen(env.PORT, "0.0.0.0", () => {
  process.stdout.write(`WISH MATCH API listening on 0.0.0.0:${env.PORT}\n`);
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write(`${signal} received; shutting down\n`);
  server.close(async (error) => {
    await closeDatabase().catch(() => undefined);
    process.exit(error ? 1 : 0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
