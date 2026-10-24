import { PGlite } from "@electric-sql/pglite";
import { products } from "@pulso/data";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { seed, seedCli, type ExampleSeedOptions } from "./seed";
import type { SeedClient } from "./seed-gate";

const sqlDir = resolve(dirname(fileURLToPath(import.meta.url)), "../sql");
const dev: ExampleSeedOptions = { env: { NODE_ENV: "test" }, argv: [] };

async function openDb(): Promise<{ client: SeedClient; close: () => Promise<void> }> {
  const db = new PGlite();
  for (const name of readdirSync(sqlDir).filter((file) => /^\d+.+\.sql$/.test(file)).sort()) {
    await db.exec(readFileSync(resolve(sqlDir, name), "utf8"));
  }
  const client: SeedClient = {
    async query(text, params) {
      const result = await db.query<Record<string, unknown>>(text, params);
      return { rows: result.rows };
    },
  };
  return {
    client,
    async close() {
      await db.close();
    },
  };
}

async function count(client: SeedClient, table: string): Promise<number> {
  const result = await client.query(`select count(*)::int as total from ${table}`);
  return Number(result.rows[0]?.total ?? 0);
}

describe("seed de exemplo", () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (closers.length) await closers.pop()?.();
  });

  async function database() {
    const opened = await openDb();
    closers.push(opened.close);
    return opened.client;
  }

  it("grava banco vazio e aceita de novo quando só há o exemplo", async () => {
    const client = await database();
    const first = await seedCli({ ...dev, client });
    expect(first).toBe(0);
    const productsBefore = await count(client, "products");
    const blocksBefore = await count(client, "post_blocks");
    expect(productsBefore).toBe(products.length);
    expect(blocksBefore).toBeGreaterThan(0);
    await client.query(
      "insert into admin_users (id, email, name, password_hash, role) values ('dono', 'dono@pulso.test', 'Dono', 'scrypt$x', 'dono')",
    );
    await client.query("delete from example_seed");
    const second = await seedCli({ ...dev, client });
    expect(second).toBe(0);
    expect(await count(client, "products")).toBe(productsBefore);
    expect(await count(client, "post_blocks")).toBe(blocksBefore);
    expect(await count(client, "example_seed")).toBe(1);
    expect(await count(client, "admin_users")).toBe(1);
  }, 20_000);

  it("recusa NODE_ENV=production e não grava", async () => {
    const client = await database();
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (value?: unknown) => {
      errors.push(value);
    };
    try {
      const code = await seedCli({ client, env: { NODE_ENV: "production" }, argv: [] });
      expect(code).not.toBe(0);
    } finally {
      console.error = original;
    }
    expect(String(errors[0])).toContain("NODE_ENV=production");
    expect(String(errors[0])).toContain("PULSO_SEED_ALLOW_OVERWRITE=1");
    expect(await count(client, "products")).toBe(0);
    expect(await count(client, "example_seed")).toBe(0);
  }, 20_000);

  it("recusa banco editado e preserva o filho do mock", async () => {
    const client = await database();
    expect(await seedCli({ ...dev, client })).toBe(0);
    const productId = products[0]?.id;
    if (!productId) throw new Error("mock sem produto");
    await client.query(
      "insert into products (id, slug, name, category, payload) values ('fora-do-mock', 'fora-do-mock', 'Fora', 'whey', '{}'::jsonb)",
    );
    await client.query(
      "insert into nutrition_rows (id, product_id, position, nutrient, amount) values ('edicao-admin', $1, 99, 'Edição', '1')",
      [productId],
    );
    await expect(seed({ ...dev, client })).rejects.toThrow(/fora-do-mock/);
    expect(await count(client, "products")).toBe(products.length + 1);
    const kept = await client.query("select id from nutrition_rows where id = 'edicao-admin'");
    expect(kept.rows).toHaveLength(1);

    await client.query("delete from products where id = 'fora-do-mock'");
    await client.query(
      "update products set updated_at = now() + interval '1 minute' where id = $1",
      [productId],
    );
    await expect(seed({ ...dev, client })).rejects.toThrow(/updated_at posterior ao seed/);
    const still = await client.query("select id from nutrition_rows where id = 'edicao-admin'");
    expect(still.rows).toHaveLength(1);
  }, 20_000);

  it("libera com a flag e regrava os filhos do mock", async () => {
    const client = await database();
    expect(await seedCli({ ...dev, client })).toBe(0);
    const productId = products[0]?.id;
    if (!productId) throw new Error("mock sem produto");
    const nutritionBefore = await count(client, "nutrition_rows");
    await client.query(
      "insert into products (id, slug, name, category, payload) values ('fora-do-mock', 'fora-do-mock', 'Fora', 'whey', '{}'::jsonb)",
    );
    await client.query(
      "insert into nutrition_rows (id, product_id, position, nutrient, amount) values ('edicao-admin', $1, 99, 'Edição', '1')",
      [productId],
    );
    const byEnv = await seedCli({
      client,
      env: { NODE_ENV: "production", PULSO_SEED_ALLOW_OVERWRITE: "1" },
      argv: [],
    });
    expect(byEnv).toBe(0);
    expect(await count(client, "products")).toBe(products.length + 1);
    expect(await client.query("select id from nutrition_rows where id = 'edicao-admin'")).toEqual({ rows: [] });
    expect(await count(client, "nutrition_rows")).toBe(nutritionBefore);

    await client.query(
      "insert into nutrition_rows (id, product_id, position, nutrient, amount) values ('edicao-admin', $1, 99, 'Edição', '1')",
      [productId],
    );
    await client.query("update products set updated_at = now() + interval '1 minute' where id = $1", [productId]);
    const byArg = await seedCli({ client, env: { NODE_ENV: "production" }, argv: ["--force-example"] });
    expect(byArg).toBe(0);
    expect(await client.query("select id from nutrition_rows where id = 'edicao-admin'")).toEqual({ rows: [] });
    const foreign = await client.query("select id from products where id = 'fora-do-mock'");
    expect(foreign.rows).toHaveLength(1);
  }, 20_000);
});
