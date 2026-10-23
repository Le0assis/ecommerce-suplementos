import { products, type CatalogProduct } from "@pulso/data";
import { readPublicProducts } from "@pulso/db/catalog";
import { readProducts } from "@pulso/db";
import type { Sql } from "@pulso/db/sql";
import Redis from "ioredis";

async function redisCommand<T>(fn: (client: Redis) => Promise<T>): Promise<T | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const client = new Redis(url, {
    connectTimeout: 800,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
  });
  try {
    await client.connect();
    return await fn(client);
  } catch {
    return null;
  } finally {
    client.disconnect();
  }
}

export async function loadProducts(sql?: Sql): Promise<{ source: string; products: CatalogProduct[] }> {
  if (sql) return { source: "postgres", products: await readPublicProducts(sql) };
  if (process.env.API_DATA_SOURCE !== "postgres") return { source: "mock", products };
  try {
    const cached = await redisCommand((client) => client.get("catalog:products"));
    if (cached) return { source: "redis", products: JSON.parse(cached) as CatalogProduct[] };
    const fromDb = await readProducts();
    if (!fromDb.length) return { source: "mock-fallback", products };
    await redisCommand((client) => client.set("catalog:products", JSON.stringify(fromDb), "EX", 60));
    return { source: "postgres", products: fromDb };
  } catch (error) {
    console.error(error);
    return { source: "mock-fallback", products };
  }
}

export async function invalidateCatalogCache(): Promise<void> {
  await redisCommand((client) => client.del("catalog:products"));
}

export async function pingPostgres(): Promise<"skipped" | "up" | "down"> {
  if (!process.env.DATABASE_URL) return "skipped";
  try {
    const { getPool } = await import("@pulso/db/pool");
    await getPool().query("select 1");
    return "up";
  } catch {
    return "down";
  }
}

export async function pingRedis(): Promise<"skipped" | "up" | "down"> {
  if (!process.env.REDIS_URL) return "skipped";
  const pong = await redisCommand((client) => client.ping());
  return pong === "PONG" ? "up" : "down";
}
