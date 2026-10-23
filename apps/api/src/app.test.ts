import { afterEach, describe, expect, it } from "vitest";
import { app, createApp } from "./app";

afterEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.REDIS_URL;
  delete process.env.API_DATA_SOURCE;
});

describe("API", () => {
  it("responde saúde sem banco", async () => {
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.service).toBe("pulso-api");
    expect(body.postgres).toBe("skipped");
  });

  it("lista o Caos e recusa cupom inventado", async () => {
    const products = await app.request("/v1/products");
    const catalog = await products.json();
    expect(catalog.products.some((product: { slug: string }) => product.slug === "caos-pre-treino")).toBe(true);
    const coupon = await app.request("/v1/coupons/validate", {
      method: "POST",
      body: JSON.stringify({ code: "nao-existe" }),
      headers: { "content-type": "application/json" },
    });
    expect(coupon.status).toBe(404);
  });

  it("simula checkout no pix", async () => {
    const response = await app.request("/v1/checkout/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        couponCode: "PULSO10",
        lines: [
          { unitPriceCents: 14990, quantity: 1, subscription: false, subscriptionDiscountPercent: 10, category: "pre-treino" },
        ],
        checkout: {
          name: "Ana Luz",
          email: "ana@pulso.dev",
          cpf: "52998224725",
          phone: "11987654321",
          cep: "01310100",
          street: "Avenida Paulista",
          number: "1000",
          neighborhood: "Bela Vista",
          city: "São Paulo",
          state: "SP",
          shippingMethod: "pac",
          paymentMethod: "pix",
          acceptLgpd: true,
          acceptAge: true,
          acceptTerms: true,
        },
      }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.simulated).toBe(true);
    expect(body.quote.pixCents).toBeGreaterThan(0);
    expect(body.quote.totalCents).toBeGreaterThan(0);
  });

  it("recusa o login do admin sem segredo de sessão", async () => {
    const previous = process.env.ADMIN_SESSION_SECRET;
    delete process.env.ADMIN_SESSION_SECRET;
    const bare = createApp();
    const response = await bare.request("/v1/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "dono@pulso.test", password: "senha-dona-pulso" }),
    });
    expect(response.status).toBe(503);
    if (previous) process.env.ADMIN_SESSION_SECRET = previous;
  });

  it("abre cobrança sandbox de pix no Mercado Pago", async () => {
    const response = await app.request("/v1/payments/sandbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method: "pix", amountCents: 15990, orderCode: "PLSAND" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sandbox).toBe(true);
    expect(body.gateway).toBe("mercadopago");
    expect(body.externalId).toBe("mp_sandbox_PLSAND");
    expect(body.status).toBe("pending");
  });
});
