import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const sqlDir = resolve(dirname(fileURLToPath(import.meta.url)), "../sql");
const migration011 = readFileSync(resolve(sqlDir, "011_consulta_cupom_cpf.sql"), "utf8");
const checkCpf = readFileSync(resolve(root, "scripts/check_cpf_hash.sql"), "utf8");

describe("migração 011 e a contagem do CPF", () => {
  it("roda duas vezes com cupom e cliente já gravados", async () => {
    const db = new PGlite();
    const files = readdirSync(sqlDir)
      .filter((name) => /^\d+.+\.sql$/.test(name) && name !== "011_consulta_cupom_cpf.sql")
      .sort();
    for (const name of files) await db.exec(readFileSync(resolve(sqlDir, name), "utf8"));
    await db.query(
      `insert into coupons (code, label, kind, percent, active) values ('PULSO10', 'Boas-vindas', 'percent', 10, true)`,
    );
    await db.query(
      "insert into customers (id, email, name, cpf) values ('cli-1', 'ana@exemplo.invalid', 'Ana', '12345678901')",
    );

    await db.exec(migration011);
    await db.exec(migration011);

    const coupon = await db.query<{ label: string; percent: number; active: boolean; public: boolean }>(
      "select label, percent, active, public from coupons where code = 'PULSO10'",
    );
    expect(coupon.rows).toEqual([{ label: "Boas-vindas", percent: 10, active: true, public: false }]);
    const customer = await db.query<{ cpf: string; cpf_hash: string | null; cpf_enc: Uint8Array | null }>(
      "select cpf, cpf_hash, cpf_enc from customers where id = 'cli-1'",
    );
    expect(customer.rows).toEqual([{ cpf: "12345678901", cpf_hash: null, cpf_enc: null }]);

    const count = await db.query<{ cpf_sem_hash: number; cpf_sem_cifra: number }>(checkCpf);
    expect(count.rows).toEqual([{ cpf_sem_hash: 1, cpf_sem_cifra: 1 }]);
    expect(checkCpf.toLowerCase()).not.toContain("insert");
    expect(checkCpf.toLowerCase()).not.toContain("update");
    expect(checkCpf.toLowerCase()).not.toContain("delete");
    await db.close();
  });
});