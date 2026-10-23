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

  it("cria o restante do admin e os índices", () => {
    const sql = readFileSync(resolve(sqlDir, "003_restantes.sql"), "utf8");
    for (const table of ["promotions", "quiz_questions", "quiz_options", "scratch_prizes", "loyalty_settings", "banners", "ugc_posts", "video_spots"]) {
      expect(sql).toContain(`create table if not exists ${table}`);
    }
    expect(sql).toContain("create index if not exists products_status_idx");
    expect(sql).toContain("create index if not exists banners_slot_idx");
  });

  it("separa autor, bloco e mídia do influencer", () => {
    const sql = readFileSync(resolve(sqlDir, "004_conteudo.sql"), "utf8");
    for (const table of ["authors", "post_blocks", "influencer_images", "influencer_quotes"]) {
      expect(sql).toContain(`create table if not exists ${table}`);
    }
    expect(sql).toContain("citacao_lateral");
    expect(sql).toContain("create index if not exists post_blocks_post_idx");
  });

  it("guarda a lista de espera com consentimento e rotina de apagar", () => {
    const sql = readFileSync(resolve(sqlDir, "005_drops.sql"), "utf8");
    expect(sql).toContain("create table if not exists drops");
    expect(sql).toContain("create table if not exists drop_waitlist");
    expect(sql).toContain("consent boolean not null check (consent)");
    expect(sql).toContain("consent_at timestamptz not null");
    expect(sql).toContain("consent_origin");
    expect(sql).toContain("anonymized_at");
    expect(sql).toContain("where anonymized_at is null");
    expect(sql).toContain("function erase_drop_waitlist");
    expect(sql).toContain("function anonymize_drop_waitlist");
    expect(sql).not.toContain("cpf");
    expect(sql).not.toContain("phone");
    expect(sql).not.toContain("user_agent");
  });
});
