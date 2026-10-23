import type { CatalogProduct } from "@pulso/data";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, readProducts } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  readProducts: vi.fn(),
}));

vi.mock("ioredis", () => {
  class FakeRedis {
    async connect() {}
    disconnect() {}
    async get(key: string) {
      return store.get(key) ?? null;
    }
    async set(key: string, value: string) {
      store.set(key, value);
      return "OK";
    }
    async del(key: string) {
      return store.delete(key) ? 1 : 0;
    }
  }
  return { default: FakeRedis };
});

vi.mock("@pulso/db", () => ({
  readProducts,
}));

vi.mock("@pulso/db/catalog", () => ({
  readPublicProducts: vi.fn(),
}));

import { invalidateCatalogCache, loadProducts } from "./catalog-source";

const previous = {
  source: process.env.API_DATA_SOURCE,
  redis: process.env.REDIS_URL,
  database: process.env.DATABASE_URL,
};

function shelf(slug: string, hidden = false): CatalogProduct {
  return { slug, name: slug, hidden } as CatalogProduct;
}

describe("cache da vitrine", () => {
  beforeEach(() => {
    store.clear();
    readProducts.mockReset();
    process.env.API_DATA_SOURCE = "postgres";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (previous.source === undefined) delete process.env.API_DATA_SOURCE;
    else process.env.API_DATA_SOURCE = previous.source;
    if (previous.redis === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previous.redis;
    if (previous.database === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.database;
  });

  it("tira o oculto do cache e, depois da gravação, mostra o produto novo", async () => {
    readProducts.mockResolvedValueOnce([shelf("na-prateleira"), shelf("oculto", true)]);
    const first = await loadProducts();
    expect(first.source).toBe("postgres");
    expect(first.products.map((product) => product.slug)).toEqual(["na-prateleira"]);

    readProducts.mockResolvedValueOnce([shelf("na-prateleira"), shelf("acabou-de-publicar")]);
    const cached = await loadProducts();
    expect(cached.source).toBe("redis");
    expect(cached.products.map((product) => product.slug)).toEqual(["na-prateleira"]);

    await invalidateCatalogCache();
    readProducts.mockResolvedValueOnce([shelf("na-prateleira"), shelf("acabou-de-publicar")]);
    const fresh = await loadProducts();
    expect(fresh.source).toBe("postgres");
    expect(fresh.products.map((product) => product.slug)).toEqual(["na-prateleira", "acabou-de-publicar"]);
  });

  it("ignora cache que não é lista e lê o banco", async () => {
    store.set("catalog:products", "{\"source\":\"redis\"}");
    readProducts.mockResolvedValueOnce([shelf("vindo-do-banco")]);
    const loaded = await loadProducts();
    expect(loaded.source).toBe("postgres");
    expect(loaded.products.map((product) => product.slug)).toEqual(["vindo-do-banco"]);
  });
});
