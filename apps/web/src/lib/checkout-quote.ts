/**
 * Orçamento novo do Backend. Enquanto `CHECKOUT_QUOTE_SHA` estiver vazio,
 * o checkout continua no `quoteCart` local e não chama a API.
 * Quando o Backend publicar o SHA, cole ele aqui para ligar o resumo do servidor.
 */
export const CHECKOUT_QUOTE_SHA = "";

export const CHECKOUT_QUOTE_PATH = "/v1/checkout/quote";

export interface ServerCheckoutLine {
  slug: string;
  variant: string;
  qty: number;
}

export interface ServerCheckoutPayload {
  lines: ServerCheckoutLine[];
  couponCode?: string;
  pointsToRedeem?: number;
}

export interface ServerQuoteLine {
  slug: string;
  variant: string;
  qty: number;
  name: string;
  unitPriceCents: number | null;
  lineCents: number | null;
}

export interface ServerQuoteSummary {
  lines: ServerQuoteLine[];
  discountCents: number;
  discountLabel: string | null;
  pointsCents: number;
  pointsUsed: number;
  pointsEarned: number;
  merchandiseCents: number | null;
  pixCents: number;
  shippingCents: number | null;
  totalCents: number | null;
}

export function serverCheckoutActive(): boolean {
  return CHECKOUT_QUOTE_SHA.trim().length > 0;
}

export function serverCheckoutPayload(input: {
  lines: { productSlug: string; variantId: string; quantity: number }[];
  couponCode?: string | null;
  pointsToRedeem?: number;
}): ServerCheckoutPayload {
  const payload: ServerCheckoutPayload = {
    lines: input.lines.map((line) => ({
      slug: line.productSlug,
      variant: line.variantId,
      qty: Math.max(1, Math.floor(line.quantity)),
    })),
  };
  const coupon = input.couponCode?.trim();
  if (coupon) payload.couponCode = coupon.toUpperCase();
  const points = Math.floor(input.pointsToRedeem ?? 0);
  if (points > 0) payload.pointsToRedeem = points;
  return payload;
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function cents(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value);
}

/** Aceita o corpo novo e descarta preço, nome e qualquer outro campo de dinheiro. */
export function onlyQuoteFields(body: unknown): ServerCheckoutPayload | null {
  const root = record(body);
  if (!root || !Array.isArray(root.lines) || root.lines.length === 0) return null;
  const lines: ServerCheckoutLine[] = [];
  for (const item of root.lines) {
    const row = record(item);
    if (!row || typeof row.slug !== "string" || typeof row.variant !== "string") return null;
    const slug = row.slug.trim();
    const variant = row.variant.trim();
    const qty = typeof row.qty === "number" ? Math.floor(row.qty) : Number.NaN;
    if (!slug || !variant || !Number.isFinite(qty) || qty < 1) return null;
    lines.push({ slug, variant, qty });
  }
  const payload: ServerCheckoutPayload = { lines };
  if (typeof root.couponCode === "string" && root.couponCode.trim()) payload.couponCode = root.couponCode.trim().toUpperCase();
  const points = typeof root.pointsToRedeem === "number" ? Math.floor(root.pointsToRedeem) : 0;
  if (points > 0) payload.pointsToRedeem = points;
  return payload;
}

export function heldQuoteResponse(): { status: number; body: { error: string } } | null {
  if (serverCheckoutActive()) return null;
  return { status: 409, body: { error: "O orçamento ainda usa o contrato atual, neste navegador." } };
}

export function readServerQuote(body: unknown): ServerQuoteSummary | null {
  const root = record(body);
  if (!root) return null;
  const source = record(root.summary) ?? record(root.quote) ?? root;
  const rawLines = Array.isArray(source.lines) ? source.lines : Array.isArray(root.lines) ? root.lines : null;
  if (!rawLines) return null;
  const lines: ServerQuoteLine[] = [];
  for (const item of rawLines) {
    const row = record(item);
    if (!row || typeof row.slug !== "string" || typeof row.variant !== "string") continue;
    const qty = typeof row.qty === "number" ? Math.floor(row.qty) : typeof row.quantity === "number" ? Math.floor(row.quantity) : null;
    if (qty === null || qty < 1) continue;
    const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : row.slug;
    lines.push({
      slug: row.slug,
      variant: row.variant,
      qty,
      name,
      unitPriceCents: cents(row.unitPriceCents),
      lineCents: cents(row.lineCents),
    });
  }
  if (!lines.length) return null;
  return {
    lines,
    discountCents: cents(source.discountCents) ?? 0,
    discountLabel: typeof source.discountLabel === "string" ? source.discountLabel : null,
    pointsCents: cents(source.pointsCents) ?? 0,
    pointsUsed: typeof source.pointsUsed === "number" && Number.isFinite(source.pointsUsed) ? Math.floor(source.pointsUsed) : 0,
    pointsEarned: typeof source.pointsEarned === "number" && Number.isFinite(source.pointsEarned) ? Math.floor(source.pointsEarned) : 0,
    merchandiseCents: cents(source.merchandiseCents),
    pixCents: cents(source.pixCents) ?? 0,
    shippingCents: cents(source.shippingCents),
    totalCents: cents(source.totalCents),
  };
}
