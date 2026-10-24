import { products } from "@pulso/data";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";

describe("orçamento do checkout", () => {
  it("o id da variação do catálogo é slug, sabor e tamanho", () => {
    const caos = products.find((product) => product.slug === "caos-pre-treino");
    expect(caos?.variants.find((variant) => variant.flavorId === "limao")?.id).toBe("caos-pre-treino__limao__300");
    for (const product of products) {
      for (const variant of product.variants) {
        expect(variant.id.startsWith(`${product.slug}__${variant.flavorId}__`)).toBe(true);
        expect(variant.id.split("__")).toHaveLength(3);
      }
    }
  });

  it("devolve um summary só com centavos inteiros e sem frete", async () => {
    const app = createApp();
    const response = await app.request("/v1/checkout/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lines: [{ slug: "caos-pre-treino", variant: "caos-pre-treino__limao__300", qty: 1 }],
        couponCode: " pulso10 ",
        pointsToRedeem: 0,
      }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      summary: {
        lines: [{ name: "Caos", unitCents: 14990, qty: 1, totalCents: 14990 }],
        subtotalCents: 14990,
        discountCents: 1499,
        pointsRedeemed: 0,
        pointsEarned: 675,
        totalCents: 13491,
      },
    });
  });

  it("recusa variação de outro produto, preço do cliente e saldo inventado", async () => {
    const app = createApp();
    const missing = await app.request("/v1/checkout/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lines: [{ slug: "caos-pre-treino", variant: "shape-whey-isolado__chocolate__900", qty: 1 }],
      }),
    });
    expect(missing.status).toBe(404);
    const priced = await app.request("/v1/checkout/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lines: [{ slug: "caos-pre-treino", variant: "caos-pre-treino__limao__300", qty: 1, unitCents: 1 }],
        pointsBalance: 100000,
      }),
    });
    expect(priced.status).toBe(400);
    const capped = await app.request("/v1/checkout/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lines: [{ slug: "caos-pre-treino", variant: "caos-pre-treino__limao__300", qty: 1 }],
        pointsToRedeem: 100000,
      }),
    });
    expect(capped.status).toBe(200);
    const body = await capped.json();
    expect(body.summary.pointsRedeemed).toBe(0);
    expect(body.summary.totalCents).toBe(14990);
    expect(body.summary.shippingCents).toBeUndefined();
  });
});
