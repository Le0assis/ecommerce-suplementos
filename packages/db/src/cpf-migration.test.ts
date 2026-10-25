import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sqlDir = resolve(dirname(fileURLToPath(import.meta.url)), "../sql");
const migration010 = readFileSync(resolve(sqlDir, "010_cpf_cifrado.sql"), "utf8");

async function databaseBeforeCpfCipher() {
  const db = new PGlite();
  const files = readdirSync(sqlDir)
    .filter((name) => /^\d+.+\.sql$/.test(name) && name !== "010_cpf_cifrado.sql")
    .sort();
  for (const name of files) {
    await db.exec(readFileSync(resolve(sqlDir, name), "utf8"));
  }
  await db.query(
    "insert into customers (id, email, name, cpf) values ('cli-1', 'ana@exemplo.invalid', 'Ana', '12345678901')",
  );
  return db;
}

describe("migração do CPF cifrado", () => {
  it("roda duas vezes com cliente já gravado e preserva o cpf em claro", async () => {
    const db = await databaseBeforeCpfCipher();
    await db.exec(migration010);
    await db.exec(migration010);

    const row = await db.query<{ cpf: string; cpf_enc: Uint8Array | null; cpf_key_id: string | null; cpf_hash: string | null }>(
      "select cpf, cpf_enc, cpf_key_id, cpf_hash from customers where id = 'cli-1'",
    );
    expect(row.rows).toEqual([{ cpf: "12345678901", cpf_enc: null, cpf_key_id: null, cpf_hash: null }]);

    const index = await db.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where indexname = 'customers_cpf_hash_key'",
    );
    expect(index.rows[0]?.indexdef.toLowerCase()).toContain("unique");
    expect(index.rows[0]?.indexdef.toLowerCase()).toContain("cpf_hash is not null");

    await db.query("update customers set cpf_hash = 'hmac-ana' where id = 'cli-1'");
    await db.query(
      "insert into customers (id, email, name, cpf, cpf_hash) values ('cli-2', 'bia@exemplo.invalid', 'Bia', '10987654321', null)",
    );
    await expect(
      db.query("update customers set cpf_hash = 'hmac-ana' where id = 'cli-2'"),
    ).rejects.toThrow(/customers_cpf_hash_key/);

    const kept = await db.query<{ cpf: string }>("select cpf from customers where id = 'cli-1'");
    expect(kept.rows[0]?.cpf).toBe("12345678901");
    await db.close();
  });
});
