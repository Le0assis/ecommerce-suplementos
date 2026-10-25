import { getProduct, getReviews, products, type CatalogProduct } from "@pulso/data";
import type { Review } from "@pulso/domain";
import { unstable_rethrow } from "next/navigation";

export interface PublicBanner {
  id: string;
  slot: string;
  title: string;
  subtitle: string | null;
  href: string | null;
  accent: string | null;
  imageUrl: string | null;
  position: number;
}

function apiBase(): string {
  return (process.env.API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
}

function relatedOf(product: CatalogProduct, list: CatalogProduct[]): CatalogProduct[] {
  return list.filter((item) => item.slug !== product.slug && item.goals.some((goal) => product.goals.includes(goal))).slice(0, 3);
}

function namesOf(list: CatalogProduct[]): Record<string, string> {
  const names: Record<string, string> = {};
  for (const item of list) {
    names[item.slug] = item.name;
    names[item.id] = item.name;
  }
  return names;
}

function catalogProduct(slug: string): { product: CatalogProduct; reviews: Review[]; related: CatalogProduct[]; names: Record<string, string> } | null {
  const product = getProduct(slug);
  if (!product) return null;
  return { product, reviews: getReviews(slug), related: relatedOf(product, products), names: namesOf(products) };
}

/** Lista da loja: só o corpo de GET /v1/products. Sem o catálogo seed. */
export async function loadPublicProducts(): Promise<CatalogProduct[]> {
  try {
    const response = await fetch(`${apiBase()}/v1/products`, {
      cache: "no-store",
      signal: AbortSignal.timeout(800),
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { products?: CatalogProduct[] };
    if (!Array.isArray(body.products)) return [];
    return body.products.filter((product) => product?.slug && product.hidden !== true);
  } catch (error) {
    unstable_rethrow(error);
    return [];
  }
}

export async function loadPublicProduct(slug: string): Promise<{ product: CatalogProduct; reviews: Review[]; related: CatalogProduct[]; names: Record<string, string> } | null> {
  try {
    const response = await fetch(`${apiBase()}/v1/products/${encodeURIComponent(slug)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(800),
    });
    if (response.status === 404) return null;
    if (!response.ok) return catalogProduct(slug);
    const body = (await response.json()) as { product?: CatalogProduct; reviews?: Review[] };
    if (!body.product?.slug) return null;
    let list = products;
    try {
      const index = await fetch(`${apiBase()}/v1/products`, { cache: "no-store", signal: AbortSignal.timeout(800) });
      if (index.ok) {
        const payload = (await index.json()) as { products?: CatalogProduct[] };
        if (Array.isArray(payload.products) && payload.products.length) list = payload.products;
      }
    } catch (error) {
      unstable_rethrow(error);
      list = products;
    }
    return {
      product: body.product,
      reviews: Array.isArray(body.reviews) ? body.reviews : [],
      related: relatedOf(body.product, list),
      names: namesOf(list),
    };
  } catch (error) {
    unstable_rethrow(error);
    return catalogProduct(slug);
  }
}

export async function loadPublicBanners(): Promise<PublicBanner[]> {
  try {
    const response = await fetch(`${apiBase()}/v1/banners`, { cache: "no-store", signal: AbortSignal.timeout(800) });
    if (!response.ok) return [];
    const body = (await response.json()) as { banners?: Partial<PublicBanner>[] };
    if (!Array.isArray(body.banners)) return [];
    return body.banners.flatMap((banner, index) => {
      if (!banner || typeof banner.title !== "string" || !banner.title.trim()) return [];
      return [{
        id: typeof banner.id === "string" && banner.id ? banner.id : `banner-${index + 1}`,
        slot: typeof banner.slot === "string" ? banner.slot : "destaque",
        title: banner.title,
        subtitle: typeof banner.subtitle === "string" ? banner.subtitle : null,
        href: typeof banner.href === "string" ? banner.href : null,
        accent: typeof banner.accent === "string" ? banner.accent : null,
        imageUrl: typeof banner.imageUrl === "string" ? banner.imageUrl : null,
        position: typeof banner.position === "number" ? banner.position : index,
      }];
    }).sort((a, b) => a.position - b.position);
  } catch (error) {
    unstable_rethrow(error);
    return [];
  }
}
