import { couponBlockReason, getAdminCoupon, readPublicCoupons, type AdminCoupon } from "@pulso/db/catalog";
import type { Sql } from "@pulso/db/sql";
import { readLoyalty } from "@pulso/db/resources";
import {
  POINT_VALUE_CENTS,
  findCoupon,
  quoteCart,
  type Coupon,
  type QuoteLine,
} from "@pulso/domain";
import { loadProducts } from "./catalog-source";

export interface CheckoutQuoteLineInput {
  slug: string;
  variant: string;
  qty: number;
}

export interface CheckoutQuoteInput {
  lines: CheckoutQuoteLineInput[];
  couponCode?: string;
  pointsToRedeem?: number;
}

export interface CheckoutQuoteSummary {
  lines: Array<{ name: string; unitCents: number; qty: number; totalCents: number }>;
  subtotalCents: number;
  discountCents: number;
  pointsRedeemed: number;
  pointsEarned: number;
  shippingCents?: number;
  totalCents: number;
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function parseCheckoutQuote(body: unknown): CheckoutQuoteInput | { error: string } {
  const root = record(body);
  if (!root || !Array.isArray(root.lines) || root.lines.length === 0 || root.lines.length > 40) {
    return { error: "Informe slug, variant e qty." };
  }
  const lines: CheckoutQuoteLineInput[] = [];
  for (const item of root.lines) {
    const row = record(item);
    if (!row || typeof row.slug !== "string" || typeof row.variant !== "string" || typeof row.qty !== "number") {
      return { error: "Informe slug, variant e qty." };
    }
    const slug = row.slug.trim();
    const variant = row.variant.trim();
    if (!slug || !variant || !Number.isInteger(row.qty) || row.qty < 1) return { error: "Informe slug, variant e qty." };
    lines.push({ slug, variant, qty: row.qty });
  }
  const parsed: CheckoutQuoteInput = { lines };
  if (root.couponCode !== undefined && root.couponCode !== null && root.couponCode !== "") {
    if (typeof root.couponCode !== "string" || !root.couponCode.trim()) return { error: "Cupom inválido." };
    parsed.couponCode = root.couponCode.trim().toUpperCase();
  }
  if (root.pointsToRedeem !== undefined && root.pointsToRedeem !== null) {
    if (typeof root.pointsToRedeem !== "number" || !Number.isInteger(root.pointsToRedeem) || root.pointsToRedeem < 0) {
      return { error: "Os pontos precisam ser um inteiro." };
    }
    if (root.pointsToRedeem > 0) parsed.pointsToRedeem = root.pointsToRedeem;
  }
  return parsed;
}

async function couponList(sql: Sql | null): Promise<Coupon[]> {
  if (sql) return readPublicCoupons(sql);
  const { coupons } = await import("@pulso/data");
  return coupons;
}

async function resolveCoupon(sql: Sql | null, code: string): Promise<{ coupon: Coupon | null; error?: string }> {
  const stored: AdminCoupon | null = sql ? await getAdminCoupon(sql, code) : null;
  if (stored) {
    const reason = couponBlockReason(stored, new Date());
    if (reason) return { coupon: null, error: reason };
  }
  return findCoupon(code, await couponList(sql));
}

export async function buildCheckoutQuote(
  input: CheckoutQuoteInput,
  sql: Sql | null,
): Promise<{ summary: CheckoutQuoteSummary } | { error: string; status: 400 | 404 }> {
  const loaded = await loadProducts(sql ?? undefined);
  const quoteLines: QuoteLine[] = [];
  const summaryLines: CheckoutQuoteSummary["lines"] = [];
  for (const line of input.lines) {
    const product = loaded.products.find((item) => item.slug === line.slug);
    if (!product) return { error: "Produto não encontrado.", status: 404 };
    const variant = product.variants.find((item) => item.id === line.variant);
    if (!variant) return { error: "Variação não encontrada.", status: 404 };
    const unitCents = variant.priceCents;
    summaryLines.push({ name: product.name, unitCents, qty: line.qty, totalCents: unitCents * line.qty });
    quoteLines.push({
      unitPriceCents: unitCents,
      quantity: line.qty,
      subscription: false,
      subscriptionDiscountPercent: 0,
      category: product.category,
    });
  }
  const resolved = input.couponCode ? await resolveCoupon(sql, input.couponCode) : { coupon: null };
  if (input.couponCode && resolved.error) return { error: resolved.error, status: 400 };
  const loyalty = sql ? await readLoyalty(sql) : null;
  const points = input.pointsToRedeem ?? 0;
  const pointValue = loyalty?.pointValueCents ?? POINT_VALUE_CENTS;
  const quote = quoteCart({
    lines: quoteLines,
    coupon: resolved.coupon,
    redeemPoints: points,
    pointsBalance: points,
    lifetimePoints: 0,
    payment: "boleto",
    shippingMethod: "pac",
    pacCents: 0,
    sedexCents: 0,
    ...(loyalty
      ? {
          pixDiscountPercent: loyalty.pixDiscountPercent,
          freeShippingBaseCents: loyalty.freeShippingCents,
          kitDiscountPercent: loyalty.kitDiscountPercent,
          maxPointsRedeemRatio: loyalty.maxPointsRedeemRatio,
          pointsPerReal: loyalty.pointsPerReal,
          pixPointsBonus: loyalty.pixPointsBonus,
          pointValueCents: loyalty.pointValueCents,
        }
      : {}),
  });
  const summary: CheckoutQuoteSummary = {
    lines: summaryLines,
    subtotalCents: quote.grossCents,
    discountCents: quote.discountCents,
    pointsRedeemed: pointValue > 0 ? Math.floor(quote.pointsCents / pointValue) : 0,
    pointsEarned: quote.pointsEarned,
    totalCents: quote.productAfterDiscountsCents,
  };
  return { summary };
}
