import { PGlite } from "@electric-sql/pglite";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { backfillCpf } from "./backfill-cpf";
import { decryptCpf, hashCpf, loadCpfKeys, sealCpf, type CpfKeys } from "./cpf";
import type { SqlClient } from "./sql";

const sqlDir = resolve(dirname(fileURLToPath(import.meta.url)), "../sql");

function keys(): CpfKeys {
  return { keyId: "local-1", encKey: randomBytes(32), hmacKey: randomBytes(32) };
}

async function database(): Promise<{ db: PGlite; sql: SqlClient }> {
  const db = new PGlite();
  for (const name of readdirSync(sqlDir).filter((file) => file.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(resolve(sqlDir, name), "utf8"));
  }
  const sql: SqlClient = {
    async query<T>(text: string, params: unknown[] = []) {
      const result = await db.query<T>(text, params);
      return { rows: result.rows };
    },
    async begin() {
      await db.exec("begin");
    },
    async commit() {
      await db.exec("commit");
    },
    async rollback() {
      await db.exec("rollback");
    },
  };
  return { db, sql };
}

describe("CPF cifrado", () => {
  it("cifra com AES-256-GCM e busca pelo HMAC, sem repetir o IV", () => {
    const material = keys();
    const first = sealCpf("529.982.247-25", material);
    const second = sealCpf("52998224725", material);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.cpfHash).toBe(second!.cpfHash);
    expect(first!.cpfHash).toBe(hashCpf("52998224725", material));
    expect(Buffer.compare(first!.cpfEnc, second!.cpfEnc)).not.toBe(0);
    expect(decryptCpf(first!.cpfEnc, material)).toBe("52998224725");
    expect(first!.cpfKeyId).toBe("local-1");
    expect(sealCpf("12345678901", material)).toBeNull();
    expect(loadCpfKeys({})).toBeNull();
  });

  it("preenche cpf_enc, cpf_key_id e cpf_hash e deixa cpf em claro", async () => {
    const { db, sql } = await database();
    const material = keys();
    await sql.query(
      "insert into customers (id, email, name, cpf) values ('ana', 'ana@exemplo.invalid', 'Ana', '529.982.247-25'), ('ruim', 'ruim@exemplo.invalid', 'Ruim', '12345678901'), ('copia', 'copia@exemplo.invalid', 'Copia', '52998224725')",
    );
    const report = await backfillCpf(sql, material);
    expect(report.sealed).toBe(1);
    expect(report.invalid).toEqual(["ruim"]);
    expect(report.duplicate).toEqual(["copia"]);
    const rows = await sql.query<{ id: string; cpf: string; cpf_enc: Uint8Array | null; cpf_key_id: string | null; cpf_hash: string | null }>(
      "select id, cpf, cpf_enc, cpf_key_id, cpf_hash from customers order by id",
    );
    const ana = rows.rows.find((row) => row.id === "ana");
    const ruim = rows.rows.find((row) => row.id === "ruim");
    const copia = rows.rows.find((row) => row.id === "copia");
    expect(ana?.cpf).toBe("529.982.247-25");
    expect(ana?.cpf_key_id).toBe("local-1");
    expect(ana?.cpf_hash).toBe(hashCpf("52998224725", material));
    expect(decryptCpf(ana!.cpf_enc!, material)).toBe("52998224725");
    expect(ruim).toMatchObject({ cpf: "12345678901", cpf_enc: null, cpf_key_id: null, cpf_hash: null });
    expect(copia).toMatchObject({ cpf: "52998224725", cpf_enc: null, cpf_key_id: null, cpf_hash: null });
    const again = await backfillCpf(sql, material);
    expect(again).toMatchObject({ sealed: 0, ready: 1, invalid: ["ruim"], duplicate: ["copia"] });
    const kept = await sql.query<{ cpf: string }>("select cpf from customers where id = 'ana'");
    expect(kept.rows[0]?.cpf).toBe("529.982.247-25");
    await db.close();
  });
});
