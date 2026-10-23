import pg from "pg";

export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface SqlClient extends Sql {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export function fromPgPool(pool: pg.Pool): SqlClient {
  let client: pg.PoolClient | null = null;
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const runner = client ?? pool;
      const result = await runner.query(text, params);
      return { rows: result.rows as T[] };
    },
    async begin() {
      if (client) return;
      client = await pool.connect();
      await client.query("begin");
    },
    async commit() {
      if (!client) return;
      try {
        await client.query("commit");
      } finally {
        client.release();
        client = null;
      }
    },
    async rollback() {
      if (!client) return;
      try {
        await client.query("rollback");
      } finally {
        client.release();
        client = null;
      }
    },
  };
}

export async function withTx<T>(sql: SqlClient, run: () => Promise<T>): Promise<T> {
  await sql.begin();
  try {
    const result = await run();
    await sql.commit();
    return result;
  } catch (error) {
    await sql.rollback();
    throw error;
  }
}
