import { couponBlockReason, getAdminCoupon, readPublicCoupons, type AdminCoupon } from "@pulso/db/catalog";
import type { Sql } from "@pulso/db/sql";
import { readLoyalty } from "@pulso/db/resources";
import {
  POINT_VALUE_CENTS,
  findCoupon,
  quoteCart,
  shippingRates,
  validateCheckout,
  type CheckoutInput,
  type Coupon,
  type Quote,
  type QuoteLine,
} from "@pulso/domain";
import { loadProducts } from "./catalog-source";

const LINE_KEYS = new Set(["slug", "variant", "qty"]);
const QUOTE_KEYS = new Set(["lines", "couponCode", "pointsToRedeem"]);
const SIMULATE_KEYS = new Set(["lines", "couponCode", "pointsToRedeem", "checkout"]);
const CHECKOUT_KEYS = new Set([
  "name",
  "email",
  "cpf",
  "phone",
  "cep",
  "street",
  "number",
  "complement",
  "neighborhood",
  "city",
  "state",
  "shippingMethod",
  "paymentMethod",
  "card",
  "acceptLgpd",
  "acceptAge",
  "acceptTerms",
]);
const CARD_KEYS = new Set(["number", "name", "expiry", "cvv", "installments"]);

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

function onlyKeys(row: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(row).every((key) => allowed.has(key));
}

export interface PointAccount {
  pointsBalance: number;
  lifetimePoints: number;
}

/**
 * Saldo e pontos de vida não vêm do navegador.
 * null enquanto a requisição não tiver sessão de cliente no servidor.
 */
export function serverPointAccount(account: PointAccount | null = null): PointAccount | null {
  return account;
}

type PointsBlock = { error: string; status: 422; code: "pontos_indisponiveis" };

function unavailablePoints(pointsToRedeem: number | undefined, account: PointAccount | null): PointsBlock | null {
  if ((pointsToRedeem ?? 0) <= 0) return null;
  if (account && account.pointsBalance > 0) return null;
  return { error: "O saldo de pontos ainda não está no servidor.", status: 422, code: "pontos_indisponiveis" };
}

function parseLines(root: Record<string, unknown>): CheckoutQuoteLineInput[] | { error: string } {
  if (!onlyKeys(root, root.checkout === undefined ? QUOTE_KEYS : SIMULATE_KEYS)) {
    return { error: "O preço é calculado no servidor." };
  }
  if (!Array.isArray(root.lines) || root.lines.length === 0 || root.lines.length > 40) {
    return { error: "Informe slug, variant e qty." };
  }
  const lines: CheckoutQuoteLineInput[] = [];
  for (const item of root.lines) {
    const row = record(item);
    if (!row || !onlyKeys(row, LINE_KEYS)) return { error: "O preço é calculado no servidor." };
    if (typeof row.slug !== "string" || typeof row.variant !== "string" || typeof row.qty !== "number") {
      return { error: "Informe slug, variant e qty." };
    }
    const slug = row.slug.trim();
    const variant = row.variant.trim();
    if (!slug || !variant || !Number.isInteger(row.qty) || row.qty < 1) return { error: "Informe slug, variant e qty." };
    lines.push({ slug, variant, qty: row.qty });
  }
  return lines;
}

function parseOptionalQuoteFields(root: Record<string, unknown>, lines: CheckoutQuoteLineInput[]): CheckoutQuoteInput | { error: string } {
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

export function parseCheckoutQuote(body: unknown): CheckoutQuoteInput | { error: string } {
  const root = record(body);
  if (!root) return { error: "Informe slug, variant e qty." };
  if (!onlyKeys(root, QUOTE_KEYS)) return { error: "O preço é calculado no servidor." };
  const lines = parseLines(root);
  if ("error" in lines) return lines;
  return parseOptionalQuoteFields(root, lines);
}

export interface CheckoutSimulateInput extends CheckoutQuoteInput {
  checkout: CheckoutInput;
}

export function parseCheckoutSimulate(body: unknown): CheckoutSimulateInput | { error: string } {
  const root = record(body);
  if (!root) return { error: "Pedido incompleto." };
  if (!onlyKeys(root, SIMULATE_KEYS)) return { error: "O preço é calculado no servidor." };
  const checkout = record(root.checkout);
  if (!checkout || !onlyKeys(checkout, CHECKOUT_KEYS)) return { error: "O preço é calculado no servidor." };
  const card = checkout.card;
  if (card !== undefined && card !== null) {
    const cardRow = record(card);
    if (!cardRow || !onlyKeys(cardRow, CARD_KEYS)) return { error: "O preço é calculado no servidor." };
  }
  const textFields = ["name", "email", "cpf", "phone", "cep", "street", "number", "neighborhood", "city", "state", "shippingMethod", "paymentMethod"] as const;
  if (textFields.some((key) => typeof checkout[key] !== "string")) return { error: "Pedido incompleto." };
  if (checkout.complement !== undefined && checkout.complement !== null && typeof checkout.complement !== "string") {
    return { error: "Pedido incompleto." };
  }
  if (typeof checkout.acceptLgpd !== "boolean" || typeof checkout.acceptAge !== "boolean" || typeof checkout.acceptTerms !== "boolean") {
    return { error: "Pedido incompleto." };
  }
  const lines = parseLines(root);
  if ("error" in lines) return lines;
  const priced = parseOptionalQuoteFields(root, lines);
  if ("error" in priced) return priced;
  return { ...priced, checkout: checkout as unknown as CheckoutInput };
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

export interface PricedOrderLine {
  slug: string;
  variant: string;
  name: string;
  qty: number;
  unitCents: number;
}

interface PricedCheckout {
  quoteLines: QuoteLine[];
  summaryLines: CheckoutQuoteSummary["lines"];
  orderLines: PricedOrderLine[];
  coupon: Coupon | null;
  loyalty: Awaited<ReturnType<typeof readLoyalty>> | null;
}

async function priceCheckout(input: CheckoutQuoteInput, sql: Sql | null): Promise<PricedCheckout | { error: string; status: 400 | 404 }> {
  const loaded = await loadProducts(sql ?? undefined);
  const quoteLines: QuoteLine[] = [];
  const summaryLines: CheckoutQuoteSummary["lines"] = [];
  const orderLines: PricedOrderLine[] = [];
  for (const line of input.lines) {
    const product = loaded.products.find((item) => item.slug === line.slug);
    if (!product) return { error: "Produto não encontrado.", status: 404 };
    const variant = product.variants.find((item) => item.id === line.variant);
    if (!variant) return { error: "Variação não encontrada.", status: 404 };
    const unitCents = variant.priceCents;
    summaryLines.push({ name: product.name, unitCents, qty: line.qty, totalCents: unitCents * line.qty });
    orderLines.push({ slug: line.slug, variant: line.variant, name: product.name, qty: line.qty, unitCents });
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
  return { quoteLines, summaryLines, orderLines, coupon: resolved.coupon, loyalty: sql ? await readLoyalty(sql) : null };
}

function loyaltyInput(loyalty: PricedCheckout["loyalty"]) {
  if (!loyalty) return {};
  return {
    pixDiscountPercent: loyalty.pixDiscountPercent,
    freeShippingBaseCents: loyalty.freeShippingCents,
    kitDiscountPercent: loyalty.kitDiscountPercent,
    maxPointsRedeemRatio: loyalty.maxPointsRedeemRatio,
    pointsPerReal: loyalty.pointsPerReal,
    pixPointsBonus: loyalty.pixPointsBonus,
    pointValueCents: loyalty.pointValueCents,
  };
}

export async function buildCheckoutQuote(
  input: CheckoutQuoteInput,
  sql: Sql | null,
  account: PointAccount | null = null,
): Promise<{ summary: CheckoutQuoteSummary } | { error: string; status: 400 | 404 | 422; code?: "pontos_indisponiveis" }> {
  const priced = await priceCheckout(input, sql);
  if ("error" in priced) return priced;
  account = serverPointAccount(account);
  const blocked = unavailablePoints(input.pointsToRedeem, account);
  if (blocked) return blocked;
  const points = account ?? { pointsBalance: 0, lifetimePoints: 0 };
  const pointValue = priced.loyalty?.pointValueCents ?? POINT_VALUE_CENTS;
  const quote = quoteCart({
    lines: priced.quoteLines,
    coupon: priced.coupon,
    redeemPoints: input.pointsToRedeem ?? 0,
    pointsBalance: points.pointsBalance,
    lifetimePoints: points.lifetimePoints,
    payment: "boleto",
    shippingMethod: "pac",
    pacCents: 0,
    sedexCents: 0,
    ...loyaltyInput(priced.loyalty),
  });
  const summary: CheckoutQuoteSummary = {
    lines: priced.summaryLines,
    subtotalCents: quote.grossCents,
    discountCents: quote.discountCents,
    pointsRedeemed: pointValue > 0 ? Math.floor(quote.pointsCents / pointValue) : 0,
    pointsEarned: quote.pointsEarned,
    totalCents: quote.productAfterDiscountsCents,
  };
  return { summary };
}

const SIMULATED_MESSAGE = "Nenhum valor foi cobrado. Pix, boleto e cartão são simulação de Mercado Pago / Pagar.me.";

export async function buildCheckoutSimulation(
  input: CheckoutSimulateInput,
  sql: Sql | null,
  account: PointAccount | null = null,
): Promise<{ simulated: true; message: string; quote: Quote } | { error: string; status: 400 | 404 | 422; code?: "pontos_indisponiveis"; errors?: Record<string, string> }> {
  const placed = await buildPlacedCheckout(input, sql, account);
  if ("error" in placed) return placed;
  return { simulated: true, message: SIMULATED_MESSAGE, quote: placed.quote };
}

export async function buildPlacedCheckout(
  input: CheckoutSimulateInput,
  sql: Sql | null,
  account: PointAccount | null = null,
): Promise<
  | { quote: Quote; lines: PricedOrderLine[]; message: string }
  | { error: string; status: 400 | 404 | 422; code?: "pontos_indisponiveis"; errors?: Record<string, string> }
> {
  const validated = validateCheckout(input.checkout);
  if (!validated.ok) return { error: "Pedido incompleto.", status: 400, errors: validated.errors };
  const rates = shippingRates(input.checkout.cep);
  if (!rates.ok) return { error: rates.error, status: 400 };
  const priced = await priceCheckout(input, sql);
  if ("error" in priced) return priced;
  const pac = rates.rates.find((rate) => rate.id === "pac");
  const sedex = rates.rates.find((rate) => rate.id === "sedex");
  if (!pac || !sedex) return { error: "Frete indisponível.", status: 400 };
  account = serverPointAccount(account);
  const blocked = unavailablePoints(input.pointsToRedeem, account);
  if (blocked) return blocked;
  const points = account ?? { pointsBalance: 0, lifetimePoints: 0 };
  const quote = quoteCart({
    lines: priced.quoteLines,
    coupon: priced.coupon,
    redeemPoints: input.pointsToRedeem ?? 0,
    pointsBalance: points.pointsBalance,
    lifetimePoints: points.lifetimePoints,
    payment: input.checkout.paymentMethod,
    shippingMethod: input.checkout.shippingMethod,
    pacCents: pac.priceCents,
    sedexCents: sedex.priceCents,
    ...loyaltyInput(priced.loyalty),
  });
  if (quote.totalCents < 0) return { error: "O total do pedido não pode ser negativo.", status: 400 };
  return { quote, lines: priced.orderLines, message: SIMULATED_MESSAGE };
}
