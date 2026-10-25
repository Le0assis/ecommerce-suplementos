import assert from "node:assert/strict";
import { createServer, type Server, type Socket } from "node:net";
import { afterEach, test } from "vitest";
import Redis from "ioredis";
import { loginEmailIpKey } from "@pulso/domain";
import { LOGIN_LIMIT, LOGIN_WINDOW_MS, admitLogin, clearLoginEmail, disconnectLoginRedis, loginStoreMode, noteLoginFailure, resetLoginLimits } from "@/server/login-limit";

const start = 1_700_000_000_000;

afterEach(() => {
  resetLoginLimits();
  disconnectLoginRedis();
});

test("loginEmailIpKey separa e-mail e IP, e os dois baldes travam antes da senha", async () => {
  resetLoginLimits();
  assert.equal(loginEmailIpKey("  Dono@Pulso.Test ", "203.0.113.1"), "dono@pulso.test|203.0.113.1");
  const attacker = "203.0.113.50";
  const owner = "203.0.113.1";
  for (let n = 0; n < LOGIN_LIMIT; n += 1) {
    assert.equal((await admitLogin(`giro-${n}@pulso.test`, attacker, start)).ok, true);
    assert.equal(await noteLoginFailure(`giro-${n}@pulso.test`, attacker, start), true);
  }
  assert.equal((await admitLogin("dono@pulso.test", attacker, start)).ok, false);
  assert.equal((await admitLogin("dono@pulso.test", owner, start)).ok, true);
  assert.equal(await noteLoginFailure("  Dono@Pulso.Test ", owner, start), true);
  for (let n = 1; n < LOGIN_LIMIT; n += 1) assert.equal(await noteLoginFailure("dono@pulso.test", owner, start), true);
  assert.equal((await admitLogin("DONO@pulso.test", owner, start)).ok, false);
  assert.equal(await noteLoginFailure("dono@pulso.test", owner, start), false);
  assert.equal((await admitLogin("outro@pulso.test", owner, start)).ok, false);
  assert.equal(await noteLoginFailure("dono@pulso.test", "203.0.113.9", start), true);
  assert.equal((await admitLogin("outro@pulso.test", owner, start + LOGIN_WINDOW_MS)).ok, true);
  await clearLoginEmail("dono@pulso.test", owner, start);
  assert.equal((await admitLogin("dono@pulso.test", owner, start)).ok, true);
  assert.equal(await noteLoginFailure("dono@pulso.test", owner, start), true);
  assert.equal((await admitLogin("outro@pulso.test", owner, start)).ok, true);
});

test("produção sem Redis não usa o Map, e o Redis da API trava o par antes da senha", async () => {
  const env = process.env as { NODE_ENV?: string; REDIS_URL?: string };
  const previousNode = env.NODE_ENV;
  const previousRedis = env.REDIS_URL;
  env.NODE_ENV = "production";
  delete env.REDIS_URL;
  try {
    assert.equal(loginStoreMode(), "unavailable");
    assert.deepEqual(await admitLogin("dono@pulso.test", "203.0.113.9", start), { ok: false, status: 503 });
  } finally {
    if (previousNode === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousNode;
  }

  const redis = await startRedis();
  process.env.REDIS_URL = `redis://127.0.0.1:${redis.port}`;
  disconnectLoginRedis();
  const email = "dono@pulso.test";
  const ip = "203.0.113.9";
  const client = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  client.on("error", () => undefined);
  await client.connect();
  try {
    assert.equal(loginStoreMode(), "redis");
    await client.set(`pulso:login:ip:${ip}`, "30");
    await client.set(`pulso:login:ipuser:${ip}:${email}`, "30");
    await client.set(`pulso:login:emailip:${loginEmailIpKey(email, ip)}`, "30");
    assert.equal((await admitLogin(` ${email.toUpperCase()} `, ip, start)).ok, false);
    assert.equal((await admitLogin("outro@pulso.test", "203.0.113.10", start)).ok, true);
    const calls = redis.commands.filter((command) => command[0] === "INCR" || command[0] === "DECRBY");
    assert.equal(calls.length, 0);
  } finally {
    client.disconnect();
    disconnectLoginRedis();
    if (previousRedis === undefined) delete env.REDIS_URL;
    else env.REDIS_URL = previousRedis;
    if (previousNode === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousNode;
    await redis.close();
  }
});

test("Redis pausado em produção responde 503 antes da senha", async () => {
  const env = process.env as { NODE_ENV?: string; REDIS_URL?: string };
  const previousNode = env.NODE_ENV;
  const previousRedis = env.REDIS_URL;
  const redis = await startRedis(true);
  env.NODE_ENV = "production";
  env.REDIS_URL = `redis://127.0.0.1:${redis.port}`;
  disconnectLoginRedis();
  const started = Date.now();
  try {
    assert.deepEqual(await admitLogin("dono@pulso.test", "203.0.113.9", start), { ok: false, status: 503 });
    assert.ok(Date.now() - started < 2_000);
  } finally {
    disconnectLoginRedis();
    if (previousRedis === undefined) delete env.REDIS_URL;
    else env.REDIS_URL = previousRedis;
    if (previousNode === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousNode;
    await redis.close();
  }
});

function startRedis(pauseData = false): Promise<{ port: number; commands: string[][]; close: () => Promise<void> }> {
  const store = new Map<string, string>();
  const commands: string[][] = [];
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => undefined);
    socket.on("close", () => sockets.delete(socket));
    let pending = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length > 0) {
        const parsed = readCommand(pending);
        if (!parsed) break;
        pending = pending.subarray(parsed.bytes);
        commands.push(parsed.args);
        const command = (parsed.args[0] ?? "").toUpperCase();
        if (pauseData && command !== "INFO" && command !== "PING" && command !== "INLINE" && command !== "CLIENT" && command !== "HELLO") {
          continue;
        }
        socket.write(reply(store, parsed.args));
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        port,
        commands,
        close: () =>
          new Promise((done) => {
            for (const socket of sockets) socket.destroy();
            server.close(() => done());
          }),
      });
    });
  });
}

function readCommand(buffer: Buffer): { args: string[]; bytes: number } | null {
  if (buffer[0] !== 42) return { args: ["PING"], bytes: buffer.length };
  const headerEnd = buffer.indexOf("\r\n");
  if (headerEnd < 0) return null;
  const count = Number(buffer.subarray(1, headerEnd).toString());
  let offset = headerEnd + 2;
  const args: string[] = [];
  for (let index = 0; index < count; index += 1) {
    if (buffer[offset] !== 36) return null;
    const lengthEnd = buffer.indexOf("\r\n", offset);
    if (lengthEnd < 0) return null;
    const length = Number(buffer.subarray(offset + 1, lengthEnd).toString());
    const start = lengthEnd + 2;
    const end = start + length;
    if (buffer.length < end + 2) return null;
    args.push(buffer.subarray(start, end).toString());
    offset = end + 2;
  }
  return { args, bytes: offset };
}

function bulk(value: string): string {
  return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
}

function reply(store: Map<string, string>, args: string[]): string {
  const command = (args[0] ?? "").toUpperCase();
  const key = args[1] ?? "";
  if (command === "INFO") return bulk("# Server\r\nredis_version:7.2.4\r\nloading:0\r\n");
  if (command === "PING" || command === "INLINE") return "+PONG\r\n";
  if (command === "CLIENT" || command === "HELLO") return "+OK\r\n";
  if (command === "GET") {
    const value = store.get(key);
    if (value === undefined) return "$-1\r\n";
    return bulk(value);
  }
  if (command === "SET") {
    store.set(key, args[2] ?? "");
    return "+OK\r\n";
  }
  return "+OK\r\n";
}
