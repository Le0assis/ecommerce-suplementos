import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vitest";
import type { AdminDrop } from "@/lib/admin-types";
import { handleAdminData } from "@/server/admin-client";
import { dispatchRecords } from "@/server/admin-records";
import { migrateAdminDb, seedAdminDb } from "@/server/admin-seed";
import type { SessionPayload } from "@/server/admin-session";
import { readAdminDb } from "@/server/admin-store";

function session(role: SessionPayload["role"]): SessionPayload {
  return {
    v: 1,
    sub: "teste",
    email: "teste@pulso.local",
    name: "Teste",
    role,
    exp: Math.floor(Date.now() / 1000) + 60,
    src: "adapter",
  };
}

test("o arquivo v1 com status publicado vira ativo e guarda o cupom", () => {
  const fresh = seedAdminDb();
  const migrated = migrateAdminDb({
    version: 1,
    products: fresh.products.map((product) => ({ ...product, status: "publicado" })),
    coupons: [...fresh.coupons, { ...fresh.coupons[0], id: "browser1", code: "BROWSER1", uses: 0 }],
    influencers: [
      { id: "luna-vaz", slug: "luna-vaz", name: "Luna Editada", handle: "@lunavaz" },
      { id: "extra", slug: "extra", name: "Extra", handle: "@extra" },
    ],
  });
  assert.ok(migrated);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.products.every((product) => product.status === "ativo"), true);
  assert.equal(migrated.coupons.some((coupon) => coupon.code === "BROWSER1"), true);
  assert.equal(migrated.influencers.find((person) => person.id === "luna-vaz")?.name, "Luna Editada");
  assert.equal(migrated.influencers.some((person) => person.id === "extra"), true);
  assert.ok(migrated.categories.length > 8);
  assert.equal(migrated.loyalty.pixDiscountPercent, 10);
});

test("a leitura reescreve o adaptador v1", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pulso-admin-v1-"));
  const previous = process.env.ADMIN_MOCK_PATH;
  const file = path.join(dir, "admin-mock.json");
  const fresh = seedAdminDb();
  writeFileSync(file, JSON.stringify({
    version: 1,
    products: fresh.products.map((product) => ({ ...product, status: "publicado" })),
    coupons: fresh.coupons,
    influencers: [],
  }));
  process.env.ADMIN_MOCK_PATH = file;
  try {
    const db = readAdminDb();
    assert.equal(db.version, 2);
    assert.equal(db.products.every((product) => product.status === "ativo"), true);
    const saved = JSON.parse(readFileSync(file, "utf8")) as { version: number };
    assert.equal(saved.version, 2);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_MOCK_PATH;
    else process.env.ADMIN_MOCK_PATH = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("kit, drop, post, avaliação e pontos seguem as regras", () => {
  const db = seedAdminDb();
  const search = new URLSearchParams();
  assert.throws(() => dispatchRecords(db, "POST", ["kits"], search, {
    name: "Alto",
    discountPercent: 40,
    kitItems: [{ productId: "base-creatina", quantity: 1 }],
  }), /12%/);
  const kit = dispatchRecords(db, "POST", ["kits"], search, {
    name: "Dupla",
    discountPercent: 10,
    kitItems: [
      { productId: "base-creatina", quantity: 1 },
      { productId: "caos-pre-treino", quantity: 1 },
    ],
  });
  assert.equal(kit?.status, 201);
  assert.throws(() => dispatchRecords(db, "POST", ["promotions"], search, {
    name: "Semana",
    kind: "percent",
    value: 40,
    targetType: "produto",
    productId: "caos-pre-treino",
    active: true,
  }), /30%/);
  assert.throws(() => dispatchRecords(db, "PATCH", ["drops", "drop-04-melancia"], search, { unitsTotal: 10 }), /estoque/);
  const drop = dispatchRecords(db, "PATCH", ["drops", "drop-04-melancia"], search, { teaser: "Chegando" });
  assert.equal((drop?.body.item as AdminDrop).unitsLeft, 14);
  const archived = dispatchRecords(db, "DELETE", ["posts", "pre-sem-passar-mal"], search, undefined);
  assert.equal((archived?.body.item as { status: string }).status, "arquivado");
  const review = dispatchRecords(db, "PATCH", ["reviews", "rv-pendente-demo"], search, { status: "aprovada", reply: "Valeu." });
  assert.equal((review?.body.item as { reply: string }).reply, "Valeu.");
  assert.throws(() => dispatchRecords(db, "PATCH", ["customers", "user-ana"], search, { pointsBalance: -1 }), /negativos/);
  assert.throws(() => dispatchRecords(db, "PATCH", ["influencers", "luna-vaz"], search, {
    images: [{ alt: "", fallbackHex: "#ff5cae" }],
  }), /texto alternativo/);
  for (const href of ["javascript:alert(1)", "data:text/html,hi", "http://pulso.dev", "//pulso.dev"]) {
    assert.throws(() => dispatchRecords(db, "POST", ["banners"], search, { title: `Ruim ${href}`, slot: "destaque", href }), /https/);
  }
  const banner = dispatchRecords(db, "POST", ["banners"], search, { title: "Capa segura", slot: "destaque", href: "https://pulso.dev/drop" });
  assert.equal((banner?.body.item as { href: string }).href, "https://pulso.dev/drop");
});

test("editor não vê pedido nem fidelidade; atendimento vê pedido", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pulso-admin-role-"));
  const previous = process.env.ADMIN_MOCK_PATH;
  process.env.ADMIN_MOCK_PATH = path.join(dir, "admin-mock.json");
  try {
    const search = new URLSearchParams();
    assert.equal((await handleAdminData(session("editor"), "GET", ["orders"], search, undefined)).status, 403);
    assert.equal((await handleAdminData(session("editor"), "GET", ["settings", "loyalty"], search, undefined)).status, 403);
    assert.equal((await handleAdminData(session("editor"), "GET", ["quiz"], search, undefined)).status, 200);
    assert.equal((await handleAdminData(session("atendimento"), "GET", ["orders"], search, undefined)).status, 200);
    assert.equal((await handleAdminData(session("atendimento"), "GET", ["reviews"], search, undefined)).status, 200);
    assert.equal((await handleAdminData(session("dono"), "GET", ["settings", "loyalty"], search, undefined)).status, 200);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_MOCK_PATH;
    else process.env.ADMIN_MOCK_PATH = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});
