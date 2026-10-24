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

  it("revoga a sessão do admin e deixa o rascunho sem data", () => {
    const sql = readFileSync(resolve(sqlDir, "006_sessoes.sql"), "utf8");
    expect(sql).toContain("create table if not exists admin_sessions");
    expect(sql).toContain("revoked_at");
    expect(sql).toContain("alter table posts alter column published_at drop not null");
  });

  it("troca a chave do bloco para o par post e id, sem editar o 004", () => {
    const files = migrationFiles(sqlDir);
    expect(files.indexOf("007_blocos_post.sql")).toBeGreaterThan(files.indexOf("006_sessoes.sql"));
    const original = readFileSync(resolve(sqlDir, "004_conteudo.sql"), "utf8");
    expect(original).toContain("id text primary key");
    const sql = readFileSync(resolve(sqlDir, "007_blocos_post.sql"), "utf8");
    expect(sql).toContain("primary key (post_id, id)");
    expect(sql).toContain("post_blocks_pkey");
    expect(sql).not.toContain("drop table");
  });

  it("acrescenta índices das consultas reais sem apagar dado", () => {
    const files = migrationFiles(sqlDir);
    expect(files).toContain("008_indices.sql");
    const sql = readFileSync(resolve(sqlDir, "008_indices.sql"), "utf8").toLowerCase();
    expect(sql).toContain("create index if not exists products_store_idx");
    expect(sql).toContain("create index if not exists reviews_public_idx");
    expect(sql).toContain("create index if not exists order_lines_order_idx");
    expect(sql).toContain("create index if not exists drop_waitlist_drop_created_idx");
    expect(sql).toContain("not valid");
    expect(sql).not.toContain("drop table");
    expect(sql).not.toContain("delete from");
    expect(sql).not.toContain("truncate");
    expect(sql).not.toContain("drop index");
  });

  it("marca o seed de exemplo sem apagar dado", () => {
    const files = migrationFiles(sqlDir);
    expect(files).toContain("009_example_seed.sql");
    expect(files.indexOf("009_example_seed.sql")).toBeGreaterThan(files.indexOf("008_indices.sql"));
    const sql = readFileSync(resolve(sqlDir, "009_example_seed.sql"), "utf8").toLowerCase();
    expect(sql).toContain("create table if not exists example_seed");
    expect(sql).toContain("applied_at timestamptz not null");
    expect(sql).not.toContain("drop table");
    expect(sql).not.toContain("delete from");
    expect(sql).not.toContain("truncate");
  });

  it("acrescenta o CPF cifrado sem mexer na coluna em claro", () => {
    const files = migrationFiles(sqlDir);
    expect(files).toContain("010_cpf_cifrado.sql");
    expect(files.indexOf("010_cpf_cifrado.sql")).toBeGreaterThan(files.indexOf("009_example_seed.sql"));
    const sql = readFileSync(resolve(sqlDir, "010_cpf_cifrado.sql"), "utf8").toLowerCase();
    expect(sql).toContain("add column if not exists cpf_enc bytea");
    expect(sql).toContain("add column if not exists cpf_key_id text");
    expect(sql).toContain("add column if not exists cpf_hash text");
    expect(sql).toContain("create unique index if not exists customers_cpf_hash_key");
    expect(sql).toContain("where cpf_hash is not null");
    expect(sql).toContain("ok do léo");
    expect(sql).not.toContain("drop column");
    expect(sql).not.toContain("drop table");
    expect(sql).not.toContain("delete from");
    expect(sql).not.toContain("truncate");
    expect(sql).not.toContain("alter column cpf");
  });

  it("acrescenta o cupom público e os índices novos sem apagar dado", () => {
    const files = migrationFiles(sqlDir);
    expect(files).toContain("011_consulta_cupom_cpf.sql");
    expect(files.indexOf("011_consulta_cupom_cpf.sql")).toBeGreaterThan(files.indexOf("010_cpf_cifrado.sql"));
    const sql = readFileSync(resolve(sqlDir, "011_consulta_cupom_cpf.sql"), "utf8").toLowerCase();
    expect(sql).toContain("add column if not exists public boolean not null default false");
    expect(sql).toContain("create index if not exists coupons_public_code_idx");
    expect(sql).toContain("create index if not exists subscriptions_product_slug_idx");
    expect(sql).toContain("create index if not exists subscriptions_variant_idx");
    expect(sql).toContain("create index if not exists customers_cpf_plain_idx");
    expect(sql).not.toContain("drop table");
    expect(sql).not.toContain("drop column");
    expect(sql).not.toContain("delete from");
    expect(sql).not.toContain("truncate");
    expect(sql).not.toContain("update ");
  });

  it("prepara conta e pedido sem duplicar tabela nem apagar dado", () => {
    const files = migrationFiles(sqlDir);
    expect(files.indexOf("012_conta_pedido.sql")).toBeGreaterThan(-1);
    expect(files.indexOf("012_conta_pedido.sql")).toBeGreaterThan(files.indexOf("011_consulta_cupom_cpf.sql"));
    const sql = readFileSync(resolve(sqlDir, "012_conta_pedido.sql"), "utf8").toLowerCase();
    expect(sql).toContain("add column if not exists password_hash text");
    expect(sql).toContain("create unique index customers_email_lower_key on customers (lower(email))");
    expect(sql).toContain("add column if not exists account_id text");
    expect(sql).toContain("add column if not exists items jsonb");
    expect(sql).toContain("orders_account_id_fkey");
    expect(sql).toContain("references customers (id)");
    expect(sql).toContain("check (total_cents >= 0)");
    expect(sql).toContain("not valid");
    expect(sql).toContain("create index if not exists orders_account_created_idx");
    expect(sql).toContain("pagamento_pendente");
    expect(sql).not.toContain("create table");
    expect(sql).not.toContain("drop table");
    expect(sql).not.toContain("drop column");
    expect(sql).not.toContain("delete from");
    expect(sql).not.toContain("truncate");
    expect(sql).not.toContain("update ");
  });

  it("013 cria a sessão revogável da conta sem apagar dado", () => {
    const files = migrationFiles(sqlDir);
    expect(files.at(-1)).toBe("013_sessoes_conta.sql");
    const sql = readFileSync(resolve(sqlDir, "013_sessoes_conta.sql"), "utf8").toLowerCase();
    expect(sql).toContain("create table if not exists customer_sessions");
    expect(sql).toContain("revoked_at timestamptz");
    expect(sql).toContain("references customers (id) on delete cascade");
    expect(sql).not.toContain("drop ");
  });
});
