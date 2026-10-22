import type { CatalogProduct } from "@pulso/data";
import { getPool } from "./pool";

export async function readProducts(): Promise<CatalogProduct[]> {
  const result = await getPool().query<{ payload: CatalogProduct }>(
    "select payload from products where active = true order by name asc",
  );
  return result.rows.map((row) => row.payload);
}
