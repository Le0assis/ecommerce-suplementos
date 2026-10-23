import assert from "node:assert/strict";
import { createServer } from "node:http";
import { afterEach, test } from "vitest";
import { LOGIN_API_TIMEOUT_MS, loginAgainstApi } from "@/server/admin-client";

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
