import type { CatalogPatch, Product } from "@pulso/domain";

export interface ProductQuery {
  category?: string;
  goal?: string;
  family?: string;
  q?: string;
  maxPriceCents?: number;
  includeHidden?: boolean;
}

export type ProductSort = "relevance" | "price-asc" | "price-desc" | "rating";

export function minPriceCents(product: Product): number {
  if (!product.variants.length) return 0;
  return Math.min(...product.variants.map((variant) => variant.priceCents));
}

export function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

export function applyCatalogPatches<T extends Product>(products: T[], patches: Record<string, CatalogPatch>): T[] {
  return products.map((product) => {
    const patch = patches[product.slug];
    if (!patch) return product;
    const name = patch.name?.trim();
    const next: T = {
      ...product,
      name: name || product.name,
      hidden: patch.hidden ?? product.hidden ?? false,
    };
    if (patch.priceCents && patch.priceCents > 0) {
      next.variants = product.variants.map((variant) => ({ ...variant, priceCents: patch.priceCents! }));
    }
    return next;
  });
}

export function filterProducts<T extends Product>(products: T[], query: ProductQuery = {}): T[] {
  const q = query.q ? normalizeSearch(query.q) : "";
  return products.filter((product) => {
    if (!query.includeHidden && product.hidden) return false;
    if (query.category && product.category !== query.category) return false;
    if (query.goal && !product.goals.includes(query.goal as T["goals"][number])) return false;
    if (query.family && !product.flavors.some((flavor) => flavor.family === query.family)) return false;
    if (query.maxPriceCents && minPriceCents(product) > query.maxPriceCents) return false;
    if (!q) return true;
    const haystack = normalizeSearch(
      [product.name, product.line, product.tagline, product.category, ...product.flavors.map((flavor) => flavor.name)].join(" "),
    );
    return haystack.includes(q);
  });
}

export function sortProducts<T extends Product>(products: T[], sort: ProductSort = "relevance"): T[] {
  const list = [...products];
  if (sort === "price-asc") list.sort((a, b) => minPriceCents(a) - minPriceCents(b));
  if (sort === "price-desc") list.sort((a, b) => minPriceCents(b) - minPriceCents(a));
  if (sort === "rating") list.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
  if (sort === "relevance") {
    list.sort((a, b) => Number(b.badges.includes("bestseller")) - Number(a.badges.includes("bestseller")) || b.rating - a.rating);
  }
  return list;
}

export function searchProducts<T extends Product>(products: T[], q: string): T[] {
  return sortProducts(filterProducts(products, { q }), "relevance");
}
