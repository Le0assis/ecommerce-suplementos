import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { POST } from "@/app/api/admin/session/route";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function startApi(): Promise<{ port: number; stop: () => void }> {
  const env: NodeJS.ProcessEnv = { ...process.env, TRUSTED_PROXIES: "127.0.0.1" };
  delete env.REDIS_URL;
  const child: ChildProcess = spawn("pnpm", ["--dir", path.join(repoRoot, "apps/api"), "exec", "tsx", "src/admin/limit-fixture.ts"], {
    cwd: repoRoot,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let buffer = "";
  const port = new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(buffer || "A API de teste não abriu a porta.")), 30_000);
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      const match = /PULSO_FIXTURE_PORT=(\d+)/.exec(buffer);
      if (!match?.[1]) return;
      clearTimeout(timer);
      resolve(Number(match[1]));
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`API de teste saiu com ${code}: ${buffer}`));
    });
  });
  return port.then((opened) => ({
    port: opened,
    stop() {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    },
  }));
}

function login(ip: string, email: string, forgedForwardedFor?: string) {
  return POST(
    new Request("http://127.0.0.1:43123/api/admin/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "127.0.0.1:43123",
        origin: "http://127.0.0.1:43123",
        "x-real-ip": ip,
        ...(forgedForwardedFor ? { "x-forwarded-for": forgedForwardedFor } : {}),
      },
      body: JSON.stringify({ email, password: "senha-errada-pulso" }),
    }),
  );
}

test("dois clientes no Next recebem limites de 30 separados na API", async () => {
  const api = await startApi();
  process.env.API_URL = `http://127.0.0.1:${api.port}`;
  try {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await login("203.0.113.70", `visitante-${attempt}@pulso.test`);
      assert.equal(response.status, 401, `tentativa ${attempt} ainda cabia no limite do IP`);
    }
    const flooded = await login("203.0.113.70", "visitante-cheio@pulso.test");
    assert.equal(flooded.status, 429);
    assert.equal(flooded.headers.get("retry-after"), "900");
    assert.deepEqual(await flooded.json(), { error: "Muitas tentativas de login. Espera alguns minutos." });

    const other = await login("203.0.113.71", "outro@pulso.test");
    assert.equal(other.status, 401);
    assert.equal(other.headers.get("retry-after"), null);

    const stillFlooded = await login("203.0.113.70", "xff-falso@pulso.test", "198.51.100.70");
    assert.equal(stillFlooded.status, 429);
    assert.equal(stillFlooded.headers.get("retry-after"), "900");

    const spoofedKey = await login("203.0.113.72", "xff-do-cheio@pulso.test", "203.0.113.70");
    assert.equal(spoofedKey.status, 401);
    assert.equal(spoofedKey.headers.get("retry-after"), null);
  } finally {
    delete process.env.API_URL;
    api.stop();
  }
}, 60_000);
