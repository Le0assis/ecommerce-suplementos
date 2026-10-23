import { PGlite } from "@electric-sql/pglite";
import { CATEGORIES, GOALS } from "@pulso/domain";
import { hashPassword } from "@pulso/db/password";
import type { SqlClient } from "@pulso/db/sql";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../app";
import { resetLoginLimits } from "./auth-routes";
import type { UploadSigner } from "./uploads";

const SECRET = "teste-sessao-pulso-admin";

export async function createTestDb(): Promise<{ sql: SqlClient; close: () => Promise<void> }> {
  const db = new PGlite();
  const sqlDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../packages/db/sql");
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
  for (const [position, category] of CATEGORIES.entries()) {
    await sql.query("insert into categories (slug, name, blurb, position) values ($1, $2, $3, $4)", [
      category.id,
      category.label,
      category.blurb,
      position,
    ]);
  }
  for (const [position, goal] of GOALS.entries()) {
    await sql.query("insert into goals (slug, name, blurb, position) values ($1, $2, $3, $4)", [goal.id, goal.label, goal.blurb, position]);
  }
  const users = [
    ["dono", "dono@pulso.test", "Dono", "senha-dona-pulso", "dono"],
    ["editor", "editor@pulso.test", "Editor", "senha-editor-pulso", "editor"],
    ["atendimento", "atendimento@pulso.test", "Atendimento", "senha-atendimento", "atendimento"],
  ] as const;
  for (const [id, email, name, password, role] of users) {
    await sql.query(
      "insert into admin_users (id, email, name, password_hash, role) values ($1, $2, $3, $4, $5)",
      [id, email, name, await hashPassword(password), role],
    );
  }
  return {
    sql,
    async close() {
      await db.close();
    },
  };
}

export function createAdminApp(sql: SqlClient, signUpload?: UploadSigner) {
  return createApp({
    sql,
    sessionSecret: SECRET,
    cookieSecure: true,
    ...(signUpload ? { signUpload } : {}),
  });
}

export async function resetTables(sql: SqlClient): Promise<void> {
  resetLoginLimits();
  await sql.query("update admin_users set failed_attempts = 0, locked_until = null");
  await sql.query(
    `truncate products, coupons, audit_log, orders, customers, influencers, posts, authors, promotions, quiz_questions,
            scratch_prizes, banners, ugc_posts, video_spots, reviews, loyalty_settings, subscriptions, drops, drop_waitlist,
            admin_sessions
     restart identity cascade`,
  );
}

export async function login(app: ReturnType<typeof createAdminApp>, email: string, password: string, ip = "203.0.113.10") {
  const response = await app.request("/v1/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ email, password }),
  });
  const body = (await response.json()) as { user?: { role: string }; error?: string };
  const cookie = response.headers.get("set-cookie") ?? "";
  const match = /pulso_admin=([^;]+)/.exec(cookie);
  return { response, body, token: match?.[1] ? decodeURIComponent(match[1]) : "" };
}

export function auth(token: string, ip = "203.0.113.10"): Record<string, string> {
  return { authorization: `Bearer ${token}`, "content-type": "application/json", "x-forwarded-for": ip };
}

export function sampleProduct(slug = "caos-teste") {
  return {
    slug,
    name: "Caos Teste",
    line: "Pré",
    tagline: "Limão de teste",
    description: "Pré de teste do admin.",
    howToUse: "Meia dose.",
    categoryId: "pre-treino",
    goals: ["energia"],
    badges: ["novo"],
    status: "publicado",
    caffeineMg: 300,
    proteinG: 0,
    influencerId: null,
    subscriptionEnabled: true,
    subscriptionPercent: 10,
    subscriptionIntervalDays: 30,
    isKit: false,
    kitItems: [],
    flavors: [{ id: "limao", name: "Limão", tagline: "Ácido", hex: "#d6ff3c", family: "citrica", limited: false, stock: 10 }],
    variants: [
      {
        flavorId: "limao",
        size: "300 g",
        sku: `PL-${slug}`.toUpperCase(),
        priceCents: 14990,
        compareAtCents: null,
        stock: 10,
        weightGrams: 300,
        servings: 30,
      },
    ],
    label: {
      registration: "NI-DEMO-TESTE",
      category: "Suplemento alimentar",
      serving: "10 g",
      servingsPerContainer: 30,
      ingredients: "Cafeína.",
      allergens: "Não contém.",
      warnings: ["Este produto não é um medicamento."],
      nutrition: [{ nutrient: "Cafeína", amount: "300 mg" }],
      manufacturer: "PULSO fictícia.",
    },
    images: [{ flavorId: "limao", url: null, alt: "Pote verde", position: 0, isCover: true, fallbackHex: "#d6ff3c" }],
  };
}
