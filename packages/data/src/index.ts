import type { Review } from "@pulso/domain";
import { catalogProducts, type CatalogProduct } from "./catalog";
import { influencers, posts } from "./content";
import { reviews } from "./reviews";
import { searchProducts } from "./query";

export function withReviewStats(products: CatalogProduct[], source: Review[] = reviews): CatalogProduct[] {
  return products.map((product) => {
    const own = source.filter((review) => review.productSlug === product.slug);
    if (!own.length) return product;
    const rating = Math.round((own.reduce((sum, review) => sum + review.rating, 0) / own.length) * 10) / 10;
    return { ...product, rating, reviewCount: own.length };
  });
}

export const products: CatalogProduct[] = withReviewStats(catalogProducts);

export function getProduct(slug: string): CatalogProduct | undefined {
  return products.find((product) => product.slug === slug);
}

export function getReviews(slug: string): Review[] {
  return reviews.filter((review) => review.productSlug === slug);
}

export function getInfluencer(slug: string) {
  return influencers.find((influencer) => influencer.slug === slug);
}

export function getPost(slug: string) {
  return posts.find((post) => post.slug === slug);
}

export interface CatalogRepository {
  listProducts(): CatalogProduct[];
  getProduct(slug: string): CatalogProduct | undefined;
  listReviews(slug: string): Review[];
  search(q: string): CatalogProduct[];
}

export const mockCatalog: CatalogRepository = {
  listProducts: () => products,
  getProduct,
  listReviews: getReviews,
  search: (q) => searchProducts(products, q),
};

export { catalogProducts, upcomingDrop } from "./catalog";
export type { CatalogProduct } from "./catalog";
export { reviews } from "./reviews";
export { influencers, posts, ugc } from "./content";
export { videos } from "./videos";
export type { VideoSpot } from "./videos";
export { applyContentPatches, cmsCatalog } from "./cms";
export type { CmsEntry, ContentPatch } from "./cms";
export { coupons } from "./coupons";
export { applyCatalogPatches, applyCouponPatches, filterProducts, minPriceCents, searchProducts, sortProducts } from "./query";
export type { ProductQuery, ProductSort } from "./query";
