import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("schema", () => {
  it("cria catálogo, pedido e pontos", () => {
    const sql = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../sql/001_init.sql"), "utf8");
    expect(sql).toContain("create table if not exists products");
    expect(sql).toContain("create table if not exists orders");
    expect(sql).toContain("create table if not exists points_ledger");
    expect(sql).toContain("pagamento_pendente");
  });
});
