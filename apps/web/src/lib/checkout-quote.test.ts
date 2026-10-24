import assert from "node:assert/strict";
import { test } from "vitest";
import { forwardCheckoutQuote } from "@/server/checkout-quote";
import {
  CHECKOUT_QUOTE_SHA,
  onlyQuoteFields,
  readServerQuote,
  serverCheckoutActive,
  serverCheckoutPayload,
} from "@/lib/checkout-quote";

test("o payload novo leva slug, variant e qty, sem preço nem nome", () => {
  const body = serverCheckoutPayload({
    lines: [
      { productSlug: "caos-pre-treino", variantId: "caos-pre-treino__limao__30", quantity: 2.8 },
      { productSlug: "shape-whey-isolado", variantId: "shape-whey-isolado__chocolate__900", quantity: 1 },
    ],
    couponCode: " luna15 ",
    pointsToRedeem: 40,
  });
  assert.deepEqual(body, {
    lines: [
      { slug: "caos-pre-treino", variant: "caos-pre-treino__limao__30", qty: 2 },
      { slug: "shape-whey-isolado", variant: "shape-whey-isolado__chocolate__900", qty: 1 },
    ],
    couponCode: "LUNA15",
    pointsToRedeem: 40,
  });
  assert.equal("unitPriceCents" in body, false);
  assert.equal("name" in body, false);
  assert.equal(JSON.stringify(body).includes("Caos"), false);
  assert.equal(JSON.stringify(body).includes("14990"), false);
});

test("cupom vazio e zero pontos ficam de fora", () => {
  const body = serverCheckoutPayload({
    lines: [{ productSlug: "caos-pre-treino", variantId: "caos-pre-treino__limao__30", quantity: 1 }],
    couponCode: "  ",
    pointsToRedeem: 0,
  });
  assert.deepEqual(Object.keys(body), ["lines"]);
});

test("campos de dinheiro do cliente são ignorados", () => {
  const clean = onlyQuoteFields({
    lines: [{ slug: "caos-pre-treino", variant: "caos-pre-treino__limao__30", qty: 1, name: "Caos", unitPriceCents: 1 }],
    couponCode: "pulso10",
    pointsToRedeem: 0,
    totalCents: 999,
  });
  assert.deepEqual(clean, {
    lines: [{ slug: "caos-pre-treino", variant: "caos-pre-treino__limao__30", qty: 1 }],
    couponCode: "PULSO10",
  });
});

test("o resumo do servidor traz nome, desconto e pontos", () => {
  const summary = readServerQuote({
    summary: {
      lines: [{ slug: "caos-pre-treino", variant: "caos-pre-treino__limao__30", qty: 1, name: "Caos", unitPriceCents: 14990, lineCents: 14990 }],
      discountCents: 1500,
      discountLabel: "LUNA15",
      pointsCents: 500,
      pointsUsed: 50,
      pointsEarned: 12,
      merchandiseCents: 12990,
      pixCents: 1299,
      totalCents: 11691,
    },
  });
  assert.equal(summary?.lines[0]?.name, "Caos");
  assert.equal(summary?.discountCents, 1500);
  assert.equal(summary?.pointsEarned, 12);
  assert.equal(summary?.totalCents, 11691);
  assert.equal(summary?.shippingCents, null);
});

test("sem o SHA do Backend o contrato atual continua e a rota não chama a API", async () => {
  assert.equal(CHECKOUT_QUOTE_SHA, "");
  assert.equal(serverCheckoutActive(), false);
  const held = await forwardCheckoutQuote({
    lines: [{ slug: "caos-pre-treino", variant: "caos-pre-treino__limao__30", qty: 1, unitPriceCents: 1 }],
  });
  assert.equal(held.status, 409);
  assert.match(String((held.body as { error: string }).error), /contrato atual/);
});
