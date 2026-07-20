import { createServer } from "node:http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { closeDatabase, prisma } from "./infrastructure/prisma/client.js";

async function syncConfiguredAdmins(): Promise<void> {
  const configured = new Set([...env.adminKakaoUserIds, ...env.adminUserIds]);
  if (configured.size === 0) {
    process.stdout.write("No administrator identifier is configured.\n");
    return;
  }
  const where = {
    OR: [
      { id: { in: [...env.adminUserIds] } },
      { kakaoUserId: { in: [...env.adminKakaoUserIds] } }
    ]
  };
  const matched = await prisma.user.count({ where });
  if (matched === 0) {
    process.stderr.write(
      "Configured administrator identifiers do not match a User.id or kakaoUserId. Check ADMIN_USER_IDS and ADMIN_KAKAO_USER_IDS.\n"
    );
    return;
  }
  const promoted = await prisma.user.updateMany({
    where: { ...where, role: { not: "ADMIN" } },
    data: { role: "ADMIN" }
  });
  process.stdout.write(
    `Administrator configuration matched ${matched} user(s); promoted ${promoted.count}.\n`
  );
}

const server = createServer(app);
server.listen(env.PORT, "0.0.0.0", () => {
  process.stdout.write(`WISH MATCH API listening on 0.0.0.0:${env.PORT}\n`);
  void syncConfiguredAdmins().catch(() => {
    process.stderr.write("Failed to synchronize configured administrators.\n");
  });
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
