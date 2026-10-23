import type { CatalogProduct } from "@pulso/data";
import { readPublicProducts } from "./catalog";
import { getPool } from "./pool";
import { fromPgPool } from "./sql";

export async function readProducts(): Promise<CatalogProduct[]> {
  return readPublicProducts(fromPgPool(getPool()));
}
