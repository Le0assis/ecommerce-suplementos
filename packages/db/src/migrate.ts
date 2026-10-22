import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./env";
import { closePool, getPool } from "./pool";

export async function migrate(): Promise<void> {
  loadEnv();
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(resolve(here, "../sql/001_init.sql"), "utf8");
  const pool = getPool();
  await pool.query(sql);
}

if (process.argv[1] && process.argv[1].includes("migrate")) {
  migrate()
    .then(async () => {
      console.log("Migração aplicada.");
      await closePool();
    })
    .catch(async (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      await closePool();
      process.exit(1);
    });
}
