import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vitest";
import { adapterPasswordOk, passwordsMatch, peekBlocked, registerFailure, signSession, toPublicUser, verifySession, type SessionPayload } from "@/server/admin-session";
import { archiveProduct, createCoupon, createProduct, deleteCoupon, readAdminDb } from "@/server/admin-store";

const secret = "test-session-secret-32chars-min";

function payload(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    v: 1,
    sub: "dono-local",
    email: "dono@pulso.local",
    name: "Dono",
    role: "dono",
    exp: Math.floor(Date.now() / 1000) + 60,
    src: "adapter",
    ...overrides,
  };
}

test("a sessão assinada volta e a adulterada não", () => {
  const token = signSession(payload({ apiToken: "segredo-da-api" }), secret);
  const verified = verifySession(token, Date.now(), secret);
  assert.equal(verified?.sub, "dono-local");
  assert.equal(JSON.stringify(toPublicUser(verified!)).includes("segredo-da-api"), false);
  const [body, mac] = token.split(".");
  assert.equal(verifySession(`${body}.${mac?.slice(0, -1)}x`, Date.now(), secret), null);
  assert.equal(verifySession(token, Date.now() + 120_000, secret), null);
});

test("a senha do adaptador só confere com ADMIN_PASSWORD", () => {
  const previous = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = "pulso-teste";
  assert.equal(passwordsMatch("pulso-teste", "pulso-teste"), true);
  assert.equal(adapterPasswordOk("pulso-teste").ok, true);
  assert.equal(adapterPasswordOk("outra").ok, false);
  delete process.env.ADMIN_PASSWORD;
  assert.equal(adapterPasswordOk("pulso-teste").ok, false);
  process.env.ADMIN_PASSWORD = "pulso-admin";
  assert.equal(adapterPasswordOk("pulso-admin").ok, false);
  if (previous === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = previous;
});

test("oito senhas erradas travam o próximo pedido", () => {
  const key = `ip-${Date.now()}`;
  for (let attempt = 0; attempt < 7; attempt += 1) assert.equal(registerFailure(key).blocked, false);
  assert.equal(registerFailure(key).blocked, true);
  assert.equal(peekBlocked(key).blocked, true);
});

test("o código do admin não publica a senha", () => {
  const banned = ["NEXT_PUBLIC_ADMIN_" + "PASSWORD", "admin" + "Password"];
  const root = path.resolve(import.meta.dirname, "..");
  const hits = walk(root).filter((file) => {
    const text = readFileSync(file, "utf8");
    return banned.some((needle) => text.includes(needle));
  });
  assert.deepEqual(hits, []);
});

test("produto se arquiva e cupom usado não se apaga", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pulso-admin-"));
  const previous = process.env.ADMIN_MOCK_PATH;
  process.env.ADMIN_MOCK_PATH = path.join(dir, "admin-mock.json");
  try {
    const db = readAdminDb();
    const archived = archiveProduct(db, "caos-pre-treino");
    assert.equal(archived.product.status, "arquivado");
    assert.throws(() => deleteCoupon(db, "vencido"), /já foi usado/);
    const removed = deleteCoupon(db, "pulso10");
    assert.equal(removed.coupons.some((coupon) => coupon.id === "pulso10"), false);
    assert.throws(() => createCoupon(db, { code: "ALTO", label: "Alto", kind: "percent", value: 40, active: true }), /30%/);
    const created = createProduct(db, {
      name: "Teste",
      slug: "teste-admin",
      categoryId: "whey",
      status: "rascunho",
      label: {
        ingredients: "Soro de leite.",
        allergens: "Contém leite.",
        warnings: ["Este produto não é um medicamento."],
      },
    });
    assert.equal(created.product.id, "teste-admin");
    assert.equal(created.product.status, "rascunho");
  } finally {
    if (previous === undefined) delete process.env.ADMIN_MOCK_PATH;
    else process.env.ADMIN_MOCK_PATH = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "admin-session.test.ts") return [];
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}
