import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./env";
import { closePool, getPool } from "./pool";

export function migrationFiles(directory: string): string[] {
  return readdirSync(directory)
    .filter((name) => /^\d+.+\.sql$/.test(name))
    .sort();
}

export async function migrate(): Promise<void> {
  loadEnv();
  const here = dirname(fileURLToPath(import.meta.url));
  const directory = resolve(here, "../sql");
  const files = migrationFiles(directory);
  const pool = getPool();
  for (const file of files) {
    const sql = readFileSync(resolve(directory, file), "utf8");
    try {
      await pool.query(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${file}: ${message}`);
    }
  }
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
