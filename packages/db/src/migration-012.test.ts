import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sqlDir = resolve(dirname(fileURLToPath(import.meta.url)), "../sql");
const migration012 = readFileSync(resolve(sqlDir, "012_conta_pedido.sql"), "utf8");

async function databaseBeforeAccounts() {
  const db = new PGlite();
  const files = readdirSync(sqlDir)
    .filter((name) => /^\d+.+\.sql$/.test(name) && name < "012_conta_pedido.sql")
    .sort();
  for (const name of files) await db.exec(readFileSync(resolve(sqlDir, name), "utf8"));
  return db;
}

describe("migração 012 da conta e do pedido", () => {
  it("roda duas vezes com cliente e pedido já gravados", async () => {
    const db = await databaseBeforeAccounts();
    await db.query(
      "insert into customers (id, email, name, cpf) values ('cli-1', 'ana@exemplo.invalid', 'Ana', '12345678901')",
    );
    await db.query(
      `insert into orders (id, code, customer_id, email, status, payment_method, subtotal_cents, total_cents)
       values ('ped-1', 'PL1', 'cli-1', 'ana@exemplo.invalid', 'pagamento_pendente', 'pix', 1500, 1500)`,
    );

    await db.exec(migration012);
    await db.exec(migration012);

    const customer = await db.query<{ email: string; password_hash: string | null; cpf: string; cpf_hash: string | null }>(
      "select email, password_hash, cpf, cpf_hash from customers where id = 'cli-1'",
    );
    expect(customer.rows).toEqual([{ email: "ana@exemplo.invalid", password_hash: null, cpf: "12345678901", cpf_hash: null }]);

    const order = await db.query<{
      customer_id: string;
      status: string;
      total_cents: number;
      account_id: string | null;
      items: unknown;
    }>("select customer_id, status, total_cents, account_id, items from orders where id = 'ped-1'");
    expect(order.rows).toEqual([
      { customer_id: "cli-1", status: "pagamento_pendente", total_cents: 1500, account_id: null, items: null },
    ]);

    const indexes = await db.query<{ indexname: string }>(
      "select indexname from pg_indexes where indexname in ('customers_email_lower_key', 'orders_account_created_idx', 'customers_cpf_hash_key') order by indexname",
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      "customers_cpf_hash_key",
      "customers_email_lower_key",
      "orders_account_created_idx",
    ]);

    const constraints = await db.query<{ conname: string; convalidated: boolean }>(
      "select conname, convalidated from pg_constraint where conname in ('orders_account_id_fkey', 'orders_total_cents_nonneg') order by conname",
    );
    expect(constraints.rows).toEqual([
      { conname: "orders_account_id_fkey", convalidated: false },
      { conname: "orders_total_cents_nonneg", convalidated: false },
    ]);

    expect((await db.query("select to_regclass('accounts') as nome")).rows).toEqual([{ nome: null }]);
    expect((await db.query("select to_regclass('customer_sessions') as nome")).rows).toEqual([{ nome: null }]);

    await expect(
      db.query(
        `insert into orders (id, code, email, status, payment_method, subtotal_cents, total_cents)
         values ('ped-2', 'PL2', 'ana@exemplo.invalid', 'pagamento_pendente', 'pix', 100, -1)`,
      ),
    ).rejects.toThrow(/total_cents/);
    await expect(
      db.query(
        `insert into orders (id, code, email, status, payment_method, subtotal_cents, total_cents, account_id)
         values ('ped-3', 'PL3', 'ana@exemplo.invalid', 'pagamento_pendente', 'pix', 100, 100, 'nao-existe')`,
      ),
    ).rejects.toThrow(/account_id|foreign key/i);

    await db.query(
      `insert into orders (id, code, email, status, payment_method, subtotal_cents, total_cents, account_id, items)
       values ('ped-4', 'PL4', 'ana@exemplo.invalid', 'pago', 'pix', 100, 0, 'cli-1', '{"lines":[]}'::jsonb)`,
    );
    await db.close();
  });

  it("não cria o índice de e-mail quando lower(email) repete", async () => {
    const db = await databaseBeforeAccounts();
    await db.query(
      "insert into customers (id, email, name) values ('cli-1', 'ana@exemplo.invalid', 'Ana'), ('cli-2', 'Ana@exemplo.invalid', 'Ana Dois')",
    );
    await db.exec(migration012);
    await db.exec(migration012);

    const repetidos = await db.query<{ grupos: number; linhas: number }>(
      `select count(*)::int as grupos, coalesce(sum(qtd), 0)::int as linhas
       from (select count(*) as qtd from customers group by lower(email) having count(*) > 1) repetidos`,
    );
    expect(repetidos.rows).toEqual([{ grupos: 1, linhas: 2 }]);
    const index = await db.query("select indexname from pg_indexes where indexname = 'customers_email_lower_key'");
    expect(index.rows).toEqual([]);
    const hashes = await db.query<{ password_hash: string | null }>("select password_hash from customers order by id");
    expect(hashes.rows).toEqual([{ password_hash: null }, { password_hash: null }]);
    await db.close();
  });
});
