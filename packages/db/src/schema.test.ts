import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrationFiles } from "./migrate";

const sqlDir = resolve(dirname(fileURLToPath(import.meta.url)), "../sql");

describe("schema", () => {
  it("cria catálogo, pedido e pontos", () => {
    const sql = readFileSync(resolve(sqlDir, "001_init.sql"), "utf8");
    expect(sql).toContain("create table if not exists products");
    expect(sql).toContain("create table if not exists orders");
    expect(sql).toContain("create table if not exists points_ledger");
    expect(sql).toContain("pagamento_pendente");
  });

  it("aplica os arquivos em ordem e guarda admin e auditoria", () => {
    const files = migrationFiles(sqlDir);
    expect(files[0]).toBe("001_init.sql");
    expect(files).toContain("002_base.sql");
    const base = readFileSync(resolve(sqlDir, "002_base.sql"), "utf8");
    expect(base).toContain("create table if not exists admin_users");
    expect(base).toContain("create table if not exists audit_log");
    expect(base).toContain("create table if not exists product_flavors");
    expect(base).not.toContain("drop table");
  });
});
