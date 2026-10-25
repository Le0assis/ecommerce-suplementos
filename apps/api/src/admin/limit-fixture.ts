import { serve } from "@hono/node-server";
import { createAdminApp, createTestDb } from "./harness";

delete process.env.REDIS_URL;
process.env.TRUSTED_PROXIES = "127.0.0.1";

const db = await createTestDb();
const app = createAdminApp(db.sql);
const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
  const started = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 }, () => resolve(started));
});
const address = server.address();
const port = typeof address === "object" && address ? address.port : 0;
console.log(`PULSO_FIXTURE_PORT=${port}`);

process.on("SIGTERM", () => {
  server.close();
  void db.close();
});
