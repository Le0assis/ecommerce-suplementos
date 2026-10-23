import assert from "node:assert/strict";
import { createServer } from "node:http";
import { afterEach, test } from "vitest";
import { POST } from "@/app/api/admin/session/route";
import { LOGIN_API_TIMEOUT_MS, loginAgainstApi } from "@/server/admin-client";
import { appendForwardedFor, forwardedForApi } from "@/server/forwarded-for";

const previous = process.env.API_URL;

afterEach(() => {
  if (previous === undefined) delete process.env.API_URL;
  else process.env.API_URL = previous;
});

test("o login espera o atraso e devolve o erro com Retry-After", async () => {
  assert.ok(LOGIN_API_TIMEOUT_MS >= 15_000);
  const server = createServer((_req, res) => {
    setTimeout(() => {
      res.writeHead(429, { "content-type": "application/json", "retry-after": "900" });
      res.end(JSON.stringify({ error: "Muitas tentativas de login. Espera alguns minutos." }));
    }, 700);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  process.env.API_URL = `http://127.0.0.1:${port}`;
  try {
    const result = await loginAgainstApi("dono@pulso.local", "errada");
    assert.ok(result && result.ok === false);
    assert.equal(result.status, 429);
    assert.equal(result.error, "Muitas tentativas de login. Espera alguns minutos.");
    assert.equal(result.retryAfter, "900");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("o IP observado entra no fim da cadeia", () => {
  const request = new Request("http://127.0.0.1:43123/api/admin/session", {
    headers: { "x-forwarded-for": "1.1.1.1" },
  });
  Object.assign(request, { socket: { remoteAddress: "::ffff:203.0.113.8" } });
  assert.equal(forwardedForApi(request), "1.1.1.1, 203.0.113.8");
  assert.equal(appendForwardedFor("203.0.113.10", "203.0.113.10"), "203.0.113.10");
});

test("dois clientes no Next seguem com limites separados e o 429 da API passa inteiro", async () => {
  const seen: string[] = [];
  const server = createServer((req, res) => {
    const forwarded = String(req.headers["x-forwarded-for"] ?? "");
    seen.push(forwarded);
    if (forwarded.endsWith("203.0.113.20")) {
      res.writeHead(429, { "content-type": "application/json", "retry-after": "12" });
      res.end(JSON.stringify({ error: "Muitas tentativas de login. Espera alguns minutos." }));
      return;
    }
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "E-mail ou senha não confere." }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  process.env.API_URL = `http://127.0.0.1:${port}`;
  const post = (ip: string) =>
    POST(new Request("http://127.0.0.1:43123/api/admin/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "127.0.0.1:43123",
        origin: "http://127.0.0.1:43123",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({ email: "dono@pulso.test", password: "errada-pulso" }),
    }));
  try {
    const first = await post("203.0.113.10");
    assert.equal(first.status, 401);
    assert.deepEqual(await first.json(), { error: "E-mail ou senha não confere." });
    assert.equal(first.headers.get("retry-after"), null);
    const second = await post("203.0.113.20");
    assert.equal(second.status, 429);
    assert.deepEqual(await second.json(), { error: "Muitas tentativas de login. Espera alguns minutos." });
    assert.equal(second.headers.get("retry-after"), "12");
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const again = await post("203.0.113.10");
      assert.equal(again.status, 401);
    }
    assert.equal(seen[0], "203.0.113.10");
    assert.equal(seen[1], "203.0.113.20");
    assert.equal(seen.filter((ip) => ip === "203.0.113.10").length, 10);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
