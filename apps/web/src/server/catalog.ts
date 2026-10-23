import {
  coupons,
  influencers,
  mockCatalog,
  posts,
  products,
  reviews,
  ugc,
  upcomingDrop,
  type CatalogProduct,
} from "@pulso/data";

export interface StorefrontSnapshot {
  source: "mock" | "api";
  products: CatalogProduct[];
}

/**
 * Ponto de troca da loja.
 * DATA_SOURCE=mock (padrão) usa o catálogo em memória.
 * DATA_SOURCE=api busca GET /v1/products. Se a API cair, volta para o mock.
 */
export async function loadStorefront(): Promise<StorefrontSnapshot> {
  if (process.env.DATA_SOURCE === "api") {
    try {
      const response = await fetch(`${process.env.API_URL ?? "http://127.0.0.1:8787"}/v1/products`, { cache: "no-store" });
      if (response.ok) {
        const body = (await response.json()) as { products?: CatalogProduct[] };
        const list = Array.isArray(body.products) ? body.products.filter((product) => product.hidden !== true) : [];
        return { source: "api", products: list };
      }
    } catch {
      return { source: "mock", products };
    }
  }
  return { source: "mock", products: mockCatalog.listProducts() };
}

export const storefrontContent = { reviews, influencers, posts, ugc, coupons, upcomingDrop };
