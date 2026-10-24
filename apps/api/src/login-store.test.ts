import { describe, expect, it } from "vitest";
import { HttpError } from "./admin/http";
import { LOGIN_NO_REDIS, LOGIN_REDIS_COMMAND_TIMEOUT_MS, LOGIN_REDIS_CONNECT_TIMEOUT_MS, loginRedisOptions, openLoginStore, runLoginStore } from "./login-store";

describe("limite de login", () => {
  it("corta conexão e comando para o Redis não pendurar o login", () => {
    const options = loginRedisOptions();
    expect(options.connectTimeout).toBe(LOGIN_REDIS_CONNECT_TIMEOUT_MS);
    expect(options.commandTimeout).toBe(LOGIN_REDIS_COMMAND_TIMEOUT_MS);
    expect(options.commandTimeout).toBe(500);
    expect(options.connectTimeout).toBeLessThan(1_000);
  });

  it("em produção, Redis fora responde 503 e não chama o Map", async () => {
    const env = { NODE_ENV: "production", REDIS_URL: "redis://127.0.0.1:1" } as NodeJS.ProcessEnv;
    const state = openLoginStore(env);
    let memoryCalls = 0;
    await expect(
      runLoginStore(
        state,
        async () => {
          throw new Error("redis fora");
        },
        () => {
          memoryCalls += 1;
          return 1;
        },
        env,
      ),
    ).rejects.toMatchObject({ status: 503, message: LOGIN_NO_REDIS });
    expect(memoryCalls).toBe(0);
    expect(state.memory).toBe(false);
  });

  it("produção sem REDIS_URL não abre o Map", () => {
    expect(() => openLoginStore({ NODE_ENV: "production" })).toThrow(HttpError);
    try {
      openLoginStore({ NODE_ENV: "production" });
    } catch (error) {
      expect(error).toMatchObject({ status: 503, message: LOGIN_NO_REDIS });
    }
  });

  it("fora de produção, Redis fora cai no Map e o resto do pedido fica nele", async () => {
    const env = { NODE_ENV: "test", REDIS_URL: "redis://127.0.0.1:1" } as NodeJS.ProcessEnv;
    const state = openLoginStore(env);
    let redisCalls = 0;
    const first = await runLoginStore(
      state,
      async () => {
        redisCalls += 1;
        throw new Error("redis fora");
      },
      () => "memoria",
      env,
    );
    const second = await runLoginStore(
      state,
      async () => {
        redisCalls += 1;
        throw new Error("não devia");
      },
      () => "segue",
      env,
    );
    expect(first).toBe("memoria");
    expect(second).toBe("segue");
    expect(redisCalls).toBe(1);
    expect(state.memory).toBe(true);
  });
});
