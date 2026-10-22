import { installmentSchedule, type Installment } from "./installments";
import {
  earnedPoints,
  freeShippingThresholdCents,
  KIT_DISCOUNT_PERCENT,
  MAX_POINTS_REDEEM_RATIO,
  PIX_DISCOUNT_PERCENT,
} from "./loyalty";
import { resolveShippingCents } from "./shipping";
import type { Coupon, PaymentMethod, ShippingMethod } from "./types";

export interface QuoteLine {
  unitPriceCents: number;
  quantity: number;
  subscription: boolean;
  subscriptionDiscountPercent: number;
  category?: string;
}

export interface QuoteInput {
  lines: QuoteLine[];
  coupon: Coupon | null;
  redeemPoints: number;
  pointsBalance: number;
  lifetimePoints: number;
  payment: PaymentMethod;
  shippingMethod: ShippingMethod;
  pacCents: number;
  sedexCents: number;
  pixDiscountPercent?: number;
  freeShippingBaseCents?: number;
}

export interface Quote {
  grossCents: number;
  subscriptionSavingsCents: number;
  merchandiseCents: number;
  discountPercent: number;
  discountCents: number;
  discountLabel: string | null;
  pointsCents: number;
  pointsUsed: number;
  pixCents: number;
  productAfterDiscountsCents: number;
  shippingCents: number;
  shippingFree: boolean;
  thresholdCents: number;
  totalCents: number;
  pointsEarned: number;
  installments: Installment[];
}

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function findCoupon(code: string, coupons: Coupon[]): { coupon: Coupon | null; error?: string } {
  const normalized = normalizeCouponCode(code);
  if (!normalized) return { coupon: null, error: "Digita um cupom." };
  const coupon = coupons.find((item) => item.code === normalized);
  if (!coupon) return { coupon: null, error: "Cupom não encontrado." };
  if (!coupon.active) return { coupon: null, error: "Esse cupom não está rolando." };
  return { coupon };
}

export function quoteCart(input: QuoteInput): Quote {
  let grossCents = 0;
  let subscriptionSavingsCents = 0;
  const categories = new Set<string>();
  for (const line of input.lines) {
    const quantity = Math.max(0, Math.floor(line.quantity));
    const gross = Math.max(0, line.unitPriceCents) * quantity;
    const save = line.subscription
      ? Math.round(gross * (Math.max(0, line.subscriptionDiscountPercent) / 100))
      : 0;
    grossCents += gross;
    subscriptionSavingsCents += save;
    if (line.category && quantity > 0) categories.add(line.category);
  }
  const merchandiseCents = grossCents - subscriptionSavingsCents;

  let discountPercent = 0;
  let discountLabel: string | null = null;
  if (input.coupon?.kind === "percent" && input.coupon.percent) {
    discountPercent = input.coupon.percent;
    discountLabel = input.coupon.label;
  }
  if (categories.size >= 3 && KIT_DISCOUNT_PERCENT > discountPercent) {
    discountPercent = KIT_DISCOUNT_PERCENT;
    discountLabel = "Kit 12% — 3 categorias no carrinho";
  }
  discountPercent = Math.min(discountPercent, 30);
  const discountCents = Math.round(merchandiseCents * (discountPercent / 100));
  const afterCoupon = merchandiseCents - discountCents;

  const cap = Math.floor(afterCoupon * MAX_POINTS_REDEEM_RATIO);
  const pointsCents = Math.min(
    Math.max(0, Math.floor(input.redeemPoints)),
    cap,
    Math.max(0, Math.floor(input.pointsBalance)),
  );
  const pixBase = afterCoupon - pointsCents;
  const pixPercent = input.payment === "pix" ? (input.pixDiscountPercent ?? PIX_DISCOUNT_PERCENT) : 0;
  const pixCents = Math.round(pixBase * (pixPercent / 100));
  const productAfterDiscountsCents = pixBase - pixCents;

  const shipping = resolveShippingCents({
    method: input.shippingMethod,
    pacCents: input.pacCents,
    sedexCents: input.sedexCents,
    merchandiseCents,
    levelId: levelIdFromPoints(input.lifetimePoints),
    freeShippingBaseCents: input.freeShippingBaseCents,
    shippingCoupon: input.coupon?.kind === "shipping",
  });

  const totalCents = productAfterDiscountsCents + shipping.cents;
  return {
    grossCents,
    subscriptionSavingsCents,
    merchandiseCents,
    discountPercent,
    discountCents,
    discountLabel,
    pointsCents,
    pointsUsed: pointsCents,
    pixCents,
    productAfterDiscountsCents,
    shippingCents: shipping.cents,
    shippingFree: shipping.free,
    thresholdCents: shipping.thresholdCents,
    totalCents,
    pointsEarned: earnedPoints({
      productCents: productAfterDiscountsCents,
      lifetimePoints: input.lifetimePoints,
      payment: input.payment,
    }),
    installments: installmentSchedule(totalCents),
  };
}

function levelIdFromPoints(lifetimePoints: number): string {
  if (lifetimePoints >= 6000) return "lenda";
  if (lifetimePoints >= 2000) return "bruto";
  if (lifetimePoints >= 500) return "atleta";
  return "rookie";
}

export function minVariantPrice(prices: number[]): number {
  if (!prices.length) return 0;
  return Math.min(...prices);
}

export { freeShippingThresholdCents };
