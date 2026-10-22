import pg from "pg";

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL ausente. Copia .env.example para .env e sobe o docker compose.");
  }
  if (!pool) {
    pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 4000 });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
