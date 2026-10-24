import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { listAdvertisedCoupons } from "./catalog";
import type { Sql } from "./sql";

const init = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../sql/001_init.sql"), "utf8");

describe("cupom público", () => {
  it("não lista nada enquanto a coluna public não existe e, depois, só o que está marcado", async () => {
    const db = new PGlite();
    await db.exec(init);
    const sql: Sql = {
      async query<T>(text: string, params: unknown[] = []) {
        const result = await db.query<T>(text, params);
        return { rows: result.rows };
      },
    };
    expect(await listAdvertisedCoupons(sql)).toBeNull();
    await db.exec("alter table coupons add column public boolean not null default false");
    await db.exec(`
      insert into coupons (code, label, kind, percent, active, public) values
        ('PULSO10', 'Boas-vindas', 'percent', 10, true, true),
        ('RASPA5', 'Raspadinha', 'percent', 5, true, false),
        ('VENCIDO', 'Encerrado', 'percent', 50, false, true)
    `);
    expect(await listAdvertisedCoupons(sql)).toEqual([{ code: "PULSO10", label: "Boas-vindas", kind: "percent", percent: 10 }]);
    await db.close();
  });
});
