import { coupons, influencers, products } from "@pulso/data";
import type { AdminCoupon, AdminInfluencerRef, AdminProduct } from "@/lib/admin-types";

const SEEDED_AT = "2026-10-01T12:00:00-03:00";

export interface AdminDb {
  version: 1;
  products: AdminProduct[];
  coupons: AdminCoupon[];
  influencers: AdminInfluencerRef[];
}

export function seedAdminDb(): AdminDb {
  return {
    version: 1,
    products: products.map(toProduct),
    coupons: coupons.map(toCoupon),
    influencers: influencers.map(toInfluencer),
  };
}

function toProduct(product: (typeof products)[number]): AdminProduct {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    line: product.line,
    tagline: product.tagline,
    description: product.description,
    howToUse: product.howToUse,
    categoryId: product.category,
    goals: [...product.goals],
    badges: [...product.badges],
    status: product.hidden ? "oculto" : "publicado",
    caffeineMg: product.caffeineMg,
    proteinG: product.proteinPerServingGrams,
    influencerId: product.influencerSlug ?? null,
    subscriptionEnabled: product.subscription.enabled,
    subscriptionPercent: product.subscription.discountPercent,
    subscriptionIntervalDays: product.subscription.intervalDays,
    isKit: Boolean(product.isKit),
    kitItems: (product.kitItems ?? []).map((item) => ({ productId: item.productSlug, quantity: item.quantity })),
    flavors: product.flavors.map((flavor) => ({
      id: flavor.id,
      name: flavor.name,
      tagline: flavor.tagline,
      hex: flavor.hex,
      family: flavor.family,
      limited: Boolean(flavor.limited),
      stock: flavor.stock,
    })),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      flavorId: variant.flavorId,
      size: variant.size,
      sku: variant.sku,
      priceCents: variant.priceCents,
      compareAtCents: variant.compareAtCents ?? null,
      stock: variant.stock,
      weightGrams: variant.weightGrams,
      servings: variant.servings,
    })),
    label: {
      registration: product.label.registration,
      category: product.label.category,
      serving: product.label.serving,
      servingsPerContainer: product.label.servingsPerContainer,
      ingredients: product.label.ingredients,
      allergens: product.label.allergens,
      warnings: [...product.label.warnings],
      nutrition: product.label.nutrition.map((row) => ({
        nutrient: row.nutrient,
        amount: row.amount,
        dailyValue: row.dailyValue ?? "",
      })),
      manufacturer: product.label.manufacturer,
    },
    images: [],
    updatedAt: SEEDED_AT,
  };
}

function toCoupon(coupon: (typeof coupons)[number]): AdminCoupon {
  return {
    id: coupon.code.toLowerCase(),
    code: coupon.code,
    label: coupon.label,
    kind: coupon.kind,
    value: coupon.percent ?? 0,
    minCents: 0,
    startsAt: null,
    endsAt: coupon.active ? null : "2026-01-01T00:00:00-03:00",
    maxUses: null,
    uses: coupon.code === "VENCIDO" ? 4 : 0,
    influencerId: coupon.influencerSlug ?? null,
    active: coupon.active,
  };
}

function toInfluencer(influencer: (typeof influencers)[number]): AdminInfluencerRef {
  return { id: influencer.slug, slug: influencer.slug, name: influencer.name, handle: influencer.handle };
}
