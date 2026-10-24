import assert from "node:assert/strict";
import { createServer } from "node:http";
import { afterEach, test } from "vitest";
import { POST } from "@/app/api/admin/session/route";
import { LOGIN_API_TIMEOUT_MS, loginAgainstApi } from "@/server/admin-client";
import { SOCKET_IP_HEADER, forwardedForApi, observedClientIp } from "@/server/forwarded-for";
import { resetLoginLimits } from "@/server/login-limit";
import { SOCKET_IP_HEADER as STAMP_HEADER, installPeerStamp, stampPeerHeaders, uninstallPeerStamp } from "../../../../scripts/stamp-peer-ip.mjs";

const previous = process.env.API_URL;

afterEach(() => {
  resetLoginLimits();
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

test("o XFF do cliente não muda o IP enviado à API", () => {
  const off: NodeJS.ProcessEnv = { NODE_ENV: "test" };
  const forged = new Request("http://127.0.0.1:43123/api/admin/session", {
    headers: {
      "x-forwarded-for": "1.1.1.1, 203.0.113.8",
      "x-real-ip": "203.0.113.8",
      "x-vercel-forwarded-for": "198.51.100.4",
    },
  });
  assert.equal(forwardedForApi(forged, off), "local");

  const socketed = new Request("http://127.0.0.1:43123/api/admin/session", {
    headers: {
      "x-forwarded-for": "203.0.113.1",
      "x-real-ip": "198.51.100.9",
      "x-vercel-forwarded-for": "::ffff:198.51.100.4",
    },
  });
  Object.assign(socketed, { socket: { remoteAddress: "::ffff:203.0.113.8" } });
  assert.equal(forwardedForApi(socketed, off), "203.0.113.8");

  const onVercel: NodeJS.ProcessEnv = { NODE_ENV: "test", VERCEL: "1", VERCEL_ENV: "production" };
  const vercel = new Request("http://127.0.0.1:43123/api/admin/session", {
    headers: {
      "x-forwarded-for": "9.9.9.9",
      "x-real-ip": "203.0.113.8",
      "x-vercel-forwarded-for": "::ffff:198.51.100.4, 10.0.0.1",
    },
  });
  Object.assign(vercel, { socket: { remoteAddress: "203.0.113.8" } });
  assert.equal(forwardedForApi(vercel, onVercel), "198.51.100.4");
  assert.equal(forwardedForApi(vercel, { NODE_ENV: "test", VERCEL: "1", VERCEL_URL: "pulso.vercel.app" }), "198.51.100.4");
  assert.equal(forwardedForApi(vercel, { NODE_ENV: "test", VERCEL: "1" }), "203.0.113.8");
  assert.equal(forwardedForApi(vercel, { NODE_ENV: "test", VERCEL: "1", VERCEL_ENV: "  ", VERCEL_URL: "" }), "203.0.113.8");

  const real = new Request("http://127.0.0.1:43123/api/admin/session", {
    headers: { "x-forwarded-for": "1.1.1.1", "x-real-ip": "203.0.113.8" },
  });
  assert.equal(forwardedForApi(real, onVercel), "203.0.113.8");
  assert.equal(STAMP_HEADER, SOCKET_IP_HEADER);

  const trusted: NodeJS.ProcessEnv = { NODE_ENV: "test", TRUSTED_PROXY: "1" };
  const behind = new Request("http://127.0.0.1:43123/api/admin/session", {
    headers: {
      "x-forwarded-for": "1.1.1.1",
      "x-real-ip": "203.0.113.8",
      "x-vercel-forwarded-for": "198.51.100.4",
    },
  });
  Object.assign(behind, { socket: { remoteAddress: "10.0.0.1" } });
  assert.equal(forwardedForApi(behind, trusted), "203.0.113.8");
  const stamped: Record<string, string> = {
    "x-real-ip": "203.0.113.8",
    "x-vercel-forwarded-for": "198.51.100.4",
  };
  stampPeerHeaders(stamped, "10.0.0.1", trusted);
  assert.equal(stamped["x-real-ip"], "203.0.113.8");
  assert.equal(stamped["x-vercel-forwarded-for"], undefined);
  assert.equal(stamped[SOCKET_IP_HEADER], "10.0.0.1");
});

test("sem VERCEL girar o cabeçalho não troca o IP e não queima o do dono", () => {
  const off: NodeJS.ProcessEnv = { NODE_ENV: "test" };
  const attacker = "203.0.113.50";
  const owner = "203.0.113.1";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const headers: Record<string, string> = {
      "x-real-ip": `198.51.100.${attempt}`,
      "x-vercel-forwarded-for": `198.51.100.${attempt}`,
      "x-forwarded-for": `203.0.113.${attempt}`,
      [SOCKET_IP_HEADER]: `198.51.100.${attempt}`,
    };
    stampPeerHeaders(headers, attacker, off);
    const request = new Request("http://127.0.0.1:43123/api/admin/session", { headers });
    assert.equal(request.headers.get("x-real-ip"), null);
    assert.equal(request.headers.get("x-vercel-forwarded-for"), null);
    assert.equal(observedClientIp(request, off), attacker);
  }
  const ownerHeaders: Record<string, string> = {
    "x-real-ip": attacker,
    "x-vercel-forwarded-for": attacker,
    "x-forwarded-for": attacker,
  };
  stampPeerHeaders(ownerHeaders, owner, off);
  assert.equal(observedClientIp(new Request("http://127.0.0.1:43123/api/admin/session", { headers: ownerHeaders }), off), owner);
  const forgedOwner: Record<string, string> = {
    "x-real-ip": owner,
    "x-vercel-forwarded-for": owner,
    "x-forwarded-for": owner,
  };
  stampPeerHeaders(forgedOwner, attacker, off);
  assert.equal(observedClientIp(new Request("http://127.0.0.1:43123/api/admin/session", { headers: forgedOwner }), off), attacker);

  const flagOnly: NodeJS.ProcessEnv = { NODE_ENV: "test", VERCEL: "1" };
  const keptByFlag: Record<string, string> = {
    "x-real-ip": owner,
    "x-vercel-forwarded-for": owner,
  };
  stampPeerHeaders(keptByFlag, attacker, flagOnly);
  assert.equal(keptByFlag["x-real-ip"], undefined);
  assert.equal(keptByFlag["x-vercel-forwarded-for"], undefined);
  assert.equal(observedClientIp(new Request("http://127.0.0.1:43123/api/admin/session", { headers: keptByFlag }), flagOnly), attacker);

  const onVercel: NodeJS.ProcessEnv = { NODE_ENV: "test", VERCEL: "1", VERCEL_ENV: "preview" };
  const kept: Record<string, string> = {
    "x-real-ip": owner,
    "x-vercel-forwarded-for": owner,
  };
  stampPeerHeaders(kept, attacker, onVercel);
  assert.equal(kept["x-vercel-forwarded-for"], owner);
  assert.equal(observedClientIp(new Request("http://127.0.0.1:43123/api/admin/session", { headers: kept }), onVercel), owner);
});

test("o servidor HTTP troca o IP girado pelo do socket", async () => {
  const previous = process.env.VERCEL;
  delete process.env.VERCEL;
  installPeerStamp();
  const seen: string[] = [];
  const server = createServer((req, res) => {
    seen.push(String(req.headers[SOCKET_IP_HEADER] ?? ""));
    assert.equal(req.headers["x-real-ip"], undefined);
    assert.equal(req.headers["x-vercel-forwarded-for"], undefined);
    res.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    for (const ip of ["198.51.100.1", "198.51.100.2", "203.0.113.1"]) {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        headers: {
          "x-real-ip": ip,
          "x-vercel-forwarded-for": ip,
          "x-forwarded-for": ip,
          [SOCKET_IP_HEADER]: ip,
        },
      });
      assert.equal(response.status, 200);
    }
    assert.equal(seen.length, 3);
    assert.equal(seen[0], seen[1]);
    assert.equal(seen[1], seen[2]);
    assert.equal(seen[0] === "127.0.0.1" || seen[0] === "::1", true);
  } finally {
    uninstallPeerStamp();
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("dois clientes no Next seguem com limites separados e o 429 da API passa inteiro", async () => {
  const previousVercel = process.env.VERCEL;
  const previousVercelEnv = process.env.VERCEL_ENV;
  process.env.VERCEL = "1";
  process.env.VERCEL_ENV = "preview";
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
  const post = (ip: string, forged?: string) =>
    POST(new Request("http://127.0.0.1:43123/api/admin/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "127.0.0.1:43123",
        origin: "http://127.0.0.1:43123",
        "x-real-ip": ip,
        ...(forged ? { "x-forwarded-for": forged } : {}),
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
    const spoofed = await post("203.0.113.10", "198.51.100.99");
    assert.equal(spoofed.status, 401);
    assert.equal(seen[0], "203.0.113.10");
    assert.equal(seen[1], "203.0.113.20");
    assert.equal(seen.at(-1), "203.0.113.10");
    assert.equal(seen.filter((ip) => ip === "203.0.113.10").length, 11);
    assert.equal(seen.some((ip) => ip.includes("198.51.100.99")), false);
  } finally {
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("a 31ª falha no par e-mail e IP responde 429 e a senha certa zera o contador", async () => {
  const previousVercel = process.env.VERCEL;
  const previousVercelEnv = process.env.VERCEL_ENV;
  process.env.VERCEL = "1";
  process.env.VERCEL_ENV = "preview";
  let mode: "fail" | "ok" = "fail";
  let hits = 0;
  const server = createServer((_req, res) => {
    hits += 1;
    if (mode === "ok") {
      res.writeHead(200, {
        "content-type": "application/json",
        "set-cookie": "pulso_admin=token-teste; Path=/; HttpOnly",
      });
      res.end(JSON.stringify({ user: { id: "user-ana", email: "ana@pulso.test", name: "Ana", role: "dono" } }));
      return;
    }
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "E-mail ou senha não confere." }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  process.env.API_URL = `http://127.0.0.1:${port}`;
  const post = (ip: string, email: string) =>
    POST(new Request("http://127.0.0.1:43123/api/admin/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "127.0.0.1:43123",
        origin: "http://127.0.0.1:43123",
        "x-real-ip": ip,
      },
      body: JSON.stringify({ email, password: "errada-pulso" }),
    }));
  try {
    for (let n = 0; n < 30; n += 1) {
      assert.equal((await post("203.0.113.10", "dono@pulso.test")).status, 401);
    }
    const blocked = await post("203.0.113.10", "  DONO@pulso.test ");
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("retry-after"), "900");
    assert.match(String(((await blocked.json()) as { error: string }).error), /15 minutos/);
    const beforeOther = hits;
    const sameIp = await post("203.0.113.10", "outro@pulso.test");
    assert.equal(sameIp.status, 429);
    assert.equal(sameIp.headers.get("retry-after"), "900");
    assert.equal(hits, beforeOther);
    assert.equal((await post("203.0.113.11", "outro@pulso.test")).status, 401);

    resetLoginLimits();
    for (let n = 0; n < 20; n += 1) {
      assert.equal((await post("203.0.113.20", "ana@pulso.test")).status, 401);
    }
    mode = "ok";
    assert.equal((await post("203.0.113.20", "Ana@Pulso.Test")).status, 200);
    mode = "fail";
    for (let n = 0; n < 30; n += 1) {
      assert.equal((await post("203.0.113.20", "ana@pulso.test")).status, 401);
    }
    const again = await post("203.0.113.20", "ana@pulso.test");
    assert.equal(again.status, 429);
    assert.equal(again.headers.get("retry-after"), "900");
  } finally {
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
