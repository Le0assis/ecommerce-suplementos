import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test, vi } from "vitest";
import { DELETE, GET, POST } from "@/app/api/admin/session/route";
import { canAccess, navResource } from "@/lib/admin-types";
import { archiveProduct, createCoupon, createProduct, deleteCoupon, readAdminDb } from "@/server/admin-store";
import { loginOnApi, parseApiSetCookie, sessionCookieHeader } from "@/server/admin-session";

const cookieJar = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pulso_admin" && cookieJar.value ? { name, value: cookieJar.value } : undefined),
  }),
}));

const user = { id: "usr-1", email: "dono@pulso.test", name: "Dono", role: "dono" as const };

afterEach(() => {
  cookieJar.value = undefined;
  vi.unstubAllGlobals();
});

function loginRequest(url = "http://127.0.0.1:43123/api/admin/session", extra: Record<string, string> = {}) {
  const host = new URL(url).host;
  return new Request(url, {
    method: "POST",
    headers: {
      host,
      origin: new URL(url).origin,
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.9",
      ...extra,
    },
    body: JSON.stringify({ email: "dono@pulso.test", password: "senha-da-api" }),
  });
}

test("o cookie repassado segue o contrato da API", () => {
  const parsed = parseApiSetCookie("pulso_admin=abc.def; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200; Secure");
  assert.deepEqual(parsed, { token: "abc.def", maxAge: 43200 });
  const http = sessionCookieHeader("abc.def", 43200, false);
  assert.match(http, /^pulso_admin=abc\.def; HttpOnly; SameSite=Lax; Path=\/; Max-Age=43200$/);
  assert.equal(http.includes("Secure"), false);
  const https = sessionCookieHeader("abc.def", 43200, true);
  assert.match(https, /Secure$/);
  assert.equal(parseApiSetCookie("outra=1; Path=/"), null);
});

test("o login grava pulso_admin e não devolve o token", async () => {
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    assert.equal(url, "http://127.0.0.1:8787/v1/admin/login");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("x-forwarded-for"), "203.0.113.9");
    assert.equal(headers.has("origin"), false);
    return new Response(JSON.stringify({ user }), {
      status: 200,
      headers: { "content-type": "application/json", "set-cookie": "pulso_admin=abc.def; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200; Secure" },
    });
  });
  const response = await POST(loginRequest());
  assert.equal(response.status, 200);
  const body = (await response.json()) as { user: { role: string }; token?: string };
  assert.equal(body.user.role, "dono");
  assert.equal(body.token, undefined);
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /pulso_admin=abc\.def/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=43200/);
  assert.equal(cookie.includes("Secure"), false);
});

test("em https o cookie repassado é Secure", async () => {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ token: "abc.def", user }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": "pulso_admin=abc.def; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200; Secure" },
  }));
  const response = await POST(loginRequest("https://pulso.test/api/admin/session"));
  assert.match(response.headers.get("set-cookie") ?? "", /Secure/);
});

test("429 da API aparece no login e não abre sessão", async () => {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "Muitas tentativas de login. Espera alguns minutos." }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": "900" },
  }));
  const response = await POST(loginRequest());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "900");
  const body = (await response.json()) as { error: string };
  assert.match(body.error, /Muitas tentativas/);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("API fora do ar não cai na senha local", async () => {
  vi.stubGlobal("fetch", async () => {
    throw new Error("offline");
  });
  const direct = await loginOnApi("dono@pulso.test", "qualquer", "203.0.113.9");
  assert.equal(direct.ok, false);
  if (!direct.ok) assert.equal(direct.status, 503);
  const response = await POST(loginRequest());
  assert.equal(response.status, 503);
  const body = (await response.json()) as { user?: unknown; error: string };
  assert.equal(body.user, undefined);
  assert.match(body.error, /não respondeu/);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("me e logout usam o cookie e o bearer da API", async () => {
  cookieJar.value = "abc.def";
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (String(url).endsWith("/me")) {
      return new Response(JSON.stringify({ user: { ...user, role: "editor" } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(null, { status: 204 });
  });
  const me = await GET();
  assert.equal(me.status, 200);
  assert.equal(((await me.json()) as { user: { role: string } }).user.role, "editor");
  const meHeaders = new Headers(calls[0]?.init?.headers);
  assert.equal(meHeaders.get("authorization"), "Bearer abc.def");
  assert.equal(meHeaders.get("cookie"), "pulso_admin=abc.def");

  const logout = await DELETE(loginRequest());
  assert.equal(logout.status, 200);
  const sent = calls.find((call) => call.url.endsWith("/logout"));
  assert.equal(sent?.init?.method, "POST");
  const logoutHeaders = new Headers(sent?.init?.headers);
  assert.equal(logoutHeaders.get("authorization"), "Bearer abc.def");
  assert.equal(logoutHeaders.get("cookie"), "pulso_admin=abc.def");
  const cleared = logout.headers.get("set-cookie") ?? "";
  assert.match(cleared, /pulso_admin=;/);
  assert.match(cleared, /Max-Age=0/);
});

test("sem cookie o painel pede login", async () => {
  vi.stubGlobal("fetch", async () => {
    throw new Error("não devia chamar a API");
  });
  const response = await GET();
  assert.equal(response.status, 401);
});

test("o menu segue o papel da sessão", () => {
  assert.equal(navResource("/admin"), null);
  assert.equal(navResource("/admin/pedidos"), "orders");
  assert.equal(navResource("/admin/produtos/caos"), "products");
  assert.equal(navResource("/admin/fidelidade"), "loyalty");
  assert.equal(canAccess("editor", navResource("/admin/pedidos")), false);
  assert.equal(canAccess("editor", navResource("/admin/fidelidade")), false);
  assert.equal(canAccess("editor", navResource("/admin/quiz")), true);
  assert.equal(canAccess("atendimento", navResource("/admin/produtos")), false);
  assert.equal(canAccess("atendimento", navResource("/admin/pedidos")), true);
  assert.equal(canAccess("atendimento", navResource("/admin/avaliacoes")), true);
  assert.equal(canAccess("dono", navResource("/admin/fidelidade")), true);
  assert.equal(canAccess("editor", null), true);
});

test("o código do admin não publica a senha", () => {
  const banned = ["NEXT_PUBLIC_ADMIN_" + "PASSWORD", "admin" + "Password", "ADMIN_" + "PASSWORD"];
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
