import { coupons, getInfluencer, getPost, getReviews, influencers, posts, ugc } from "@pulso/data";
import { listInfluencers, readPublicPosts, toPublicInfluencer } from "@pulso/db/content";
import { couponBlockReason, getAdminCoupon, readPublicCoupons, type AdminCoupon } from "@pulso/db/catalog";
import { getPool } from "@pulso/db/pool";
import { listBanners, listUgc, listVideos, readLoyalty, readPublicReviews, ugcPublic } from "@pulso/db/resources";
import { fromPgPool, type Sql } from "@pulso/db/sql";
import {
  creatinePlan,
  findCoupon,
  proteinPlan,
  quizResult,
  quoteCart,
  sandboxCharge,
  shippingRates,
  validateCheckout,
  type CheckoutInput,
  type Coupon,
  type GoalId,
  type PaymentGateway,
  type PaymentMethod,
  type QuizAnswers,
  type QuoteLine,
  type ShippingMethod,
} from "@pulso/domain";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HttpError } from "./admin/http";
import { mountPublicDrops } from "./admin/drop-routes";
import { mountAdmin, type AdminAppOptions } from "./admin/router";
import { loadProducts, pingPostgres, pingRedis } from "./catalog-source";

const hits = new Map<string, { count: number; reset: number }>();

function limited(key: string): boolean {
  const now = Date.now();
  const current = hits.get(key);
  if (!current || current.reset < now) {
    hits.set(key, { count: 1, reset: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 60;
}

async function couponSource(sql?: Sql): Promise<Coupon[]> {
  if (sql) return readPublicCoupons(sql);
  if (process.env.API_DATA_SOURCE === "postgres" && process.env.DATABASE_URL) return readPublicCoupons(fromPgPool(getPool()));
  return coupons;
}

function resolveCoupon(code: string, list: Coupon[], stored: AdminCoupon | null, now: Date): { coupon: Coupon | null; error?: string } {
  if (stored) {
    const reason = couponBlockReason(stored, now);
    if (reason) return { coupon: null, error: reason };
  }
  return findCoupon(code, list);
}

function assertProductionDataSource(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.API_DATA_SOURCE === "postgres" && process.env.DATABASE_URL) return;
  throw new Error("Em produção a API exige API_DATA_SOURCE=postgres e DATABASE_URL.");
}

export function createApp(options: AdminAppOptions = {}): Hono {
  assertProductionDataSource();
  const dataSql = (): Sql | null => {
    if (options.sql) return options.sql;
    if (process.env.API_DATA_SOURCE === "postgres" && process.env.DATABASE_URL) return fromPgPool(getPool());
    return null;
  };
  const app = new Hono();

  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/v1/admin")) return next();
    return cors()(c, next);
  });

  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/v1/admin")) return next();
    if (c.req.method === "POST" && limited(c.req.header("x-forwarded-for") ?? "local")) {
      return c.json({ error: "Calma. Muitas tentativas por minuto." }, 429);
    }
    await next();
  });

  app.onError((error, c) => {
    if (error instanceof HttpError) return c.json({ error: error.message }, error.status);
    console.error(error);
    return c.json({ error: "Erro interno." }, 500);
  });

app.get("/health", async (c) => {
  const [postgres, redis] = await Promise.all([pingPostgres(), pingRedis()]);
  return c.json({
    ok: postgres !== "down" && redis !== "down",
    service: "pulso-api",
    dataSource: process.env.API_DATA_SOURCE === "postgres" ? "postgres" : "mock",
    postgres,
    redis,
  });
});

  app.get("/v1/products", async (c) => {
  const loaded = await loadProducts(options.sql);
  return c.json(loaded);
});

app.get("/v1/products/:slug", async (c) => {
  const loaded = await loadProducts(options.sql);
  const product = loaded.products.find((item) => item.slug === c.req.param("slug"));
  if (!product) return c.json({ error: "Produto não encontrado." }, 404);
  const reviewSql = dataSql();
  const reviews = reviewSql ? await readPublicReviews(reviewSql, product.slug) : getReviews(product.slug);
  return c.json({ source: loaded.source, product, reviews });
});

  app.get("/v1/search", async (c) => {
  const q = c.req.query("q") ?? "";
  const loaded = await loadProducts(options.sql);
  const normalized = q.trim().toLowerCase();
  const products = loaded.products.filter((product) =>
    `${product.name} ${product.line} ${product.flavors.map((flavor) => flavor.name).join(" ")}`.toLowerCase().includes(normalized),
  );
  return c.json({ source: loaded.source, products });
});

  app.get("/v1/influencers", async (c) => {
    const sql = dataSql();
    if (!sql) return c.json({ influencers });
    const rows = await listInfluencers(sql, false);
    return c.json({ influencers: rows.map(toPublicInfluencer) });
  });
  app.get("/v1/influencers/:slug", async (c) => {
    const sql = dataSql();
    if (!sql) {
      const influencer = getInfluencer(c.req.param("slug"));
      if (!influencer) return c.json({ error: "Atleta não encontrado." }, 404);
      return c.json({ influencer });
    }
    const row = (await listInfluencers(sql, false)).find((item) => item.slug === c.req.param("slug"));
    if (!row) return c.json({ error: "Atleta não encontrado." }, 404);
    return c.json({ influencer: toPublicInfluencer(row) });
  });
  app.get("/v1/posts", async (c) => {
    const sql = dataSql();
    if (!sql) return c.json({ posts });
    return c.json({ posts: await readPublicPosts(sql, c.req.query("influencer") || undefined) });
  });
  app.get("/v1/posts/:slug", async (c) => {
    const sql = dataSql();
    if (!sql) {
      const post = getPost(c.req.param("slug"));
      if (!post) return c.json({ error: "Texto não encontrado." }, 404);
      return c.json({ post });
    }
    const post = (await readPublicPosts(sql)).find((item) => item.slug === c.req.param("slug"));
    if (!post) return c.json({ error: "Texto não encontrado." }, 404);
    return c.json({ post });
  });
  app.get("/v1/ugc", async (c) => {
    const sql = dataSql();
    if (!sql) return c.json({ ugc });
    return c.json({ ugc: ugcPublic(await listUgc(sql, false)) });
  });
  app.get("/v1/videos", async (c) => {
    const sql = dataSql();
    if (!sql) return c.json({ videos: [] });
    const videos = await listVideos(sql, false);
    return c.json({ videos });
  });
  app.get("/v1/banners", async (c) => {
    const sql = dataSql();
    if (!sql) return c.json({ banners: [] });
    const banners = (await listBanners(sql)).filter((banner) => banner.active);
    return c.json({ banners });
  });
  app.get("/v1/settings/loyalty", async (c) => {
    const sql = dataSql();
    if (!sql) return c.json({ item: null, source: "domain" });
    return c.json({ item: await readLoyalty(sql), source: "postgres" });
  });
  app.get("/v1/coupons", async (c) => {
    const list = await couponSource(dataSql() ?? undefined);
    return c.json({ coupons: list.filter((coupon) => coupon.active).map(({ code, label, kind, percent }) => ({ code, label, kind, percent })) });
  });

app.post("/v1/quotes/shipping", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.cep !== "string") return c.json({ error: "Informe o CEP." }, 400);
  const rates = shippingRates(body.cep);
  if (!rates.ok) return c.json({ error: rates.error }, 400);
  return c.json(rates);
});

  app.post("/v1/coupons/validate", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.code !== "string") return c.json({ error: "Informe o cupom." }, 400);
  const list = await couponSource(dataSql() ?? undefined);
  const stored = dataSql() ? await getAdminCoupon(dataSql()!, body.code.trim().toUpperCase()) : null;
  const found = resolveCoupon(body.code, list, stored, new Date());
  if (!found.coupon) return c.json({ error: found.error }, 404);
  return c.json({ coupon: found.coupon });
});

app.post("/v1/calculators/protein", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Body vazio." }, 400);
  const plan = proteinPlan({ weightKg: Number(body.weightKg), goal: body.goal as GoalId, foodGramsPerKg: Number(body.foodGramsPerKg ?? 1) });
  if ("error" in plan) return c.json(plan, 400);
  return c.json(plan);
});

app.post("/v1/calculators/creatine", async (c) => {
  const body = await c.req.json().catch(() => null);
  const plan = creatinePlan(Number(body?.weightKg));
  if ("error" in plan) return c.json(plan, 400);
  return c.json(plan);
});

app.post("/v1/quiz", async (c) => {
  const body = (await c.req.json().catch(() => null)) as QuizAnswers | null;
  if (!body?.goal || !body.caffeine || !body.flavor || !body.budget) return c.json({ error: "Respostas incompletas." }, 400);
  return c.json(quizResult(body));
});

app.post("/v1/payments/sandbox", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.orderCode !== "string" || typeof body.method !== "string") {
    return c.json({ error: "Informe método e código do pedido." }, 400);
  }
  const forced = process.env.PAYMENT_GATEWAY;
  const gateway = forced === "mercadopago" || forced === "pagarme" ? (forced as PaymentGateway) : undefined;
  const charge = sandboxCharge({
    gateway,
    method: body.method as PaymentMethod,
    amountCents: Number(body.amountCents),
    orderCode: body.orderCode,
  });
  if ("error" in charge) return c.json(charge, 400);
  return c.json(charge);
});

app.post("/v1/checkout/simulate", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.checkout || !Array.isArray(body.lines)) return c.json({ error: "Pedido incompleto." }, 400);
  const checkout = body.checkout as CheckoutInput;
  const validated = validateCheckout(checkout);
  if (!validated.ok) return c.json(validated, 400);
  const rates = shippingRates(checkout.cep);
  if (!rates.ok) return c.json({ error: rates.error }, 400);
  const pac = rates.rates.find((rate) => rate.id === "pac")!;
  const sedex = rates.rates.find((rate) => rate.id === "sedex")!;
  const sql = dataSql();
  const list = await couponSource(sql ?? undefined);
  const stored = sql && body.couponCode ? await getAdminCoupon(sql, String(body.couponCode).trim().toUpperCase()) : null;
  const coupon = body.couponCode ? resolveCoupon(String(body.couponCode), list, stored, new Date()).coupon : null;
  const loyalty = sql ? await readLoyalty(sql) : null;
  const quote = quoteCart({
    lines: body.lines as QuoteLine[],
    coupon,
    redeemPoints: Number(body.redeemPoints ?? 0),
    pointsBalance: Number(body.pointsBalance ?? 0),
    lifetimePoints: Number(body.lifetimePoints ?? 0),
    payment: checkout.paymentMethod as PaymentMethod,
    shippingMethod: checkout.shippingMethod as ShippingMethod,
    pacCents: pac.priceCents,
    sedexCents: sedex.priceCents,
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
  return c.json({
    simulated: true,
    message: "Nenhum valor foi cobrado. Pix, boleto e cartão são simulação de Mercado Pago / Pagar.me.",
    quote,
  });
});

  mountPublicDrops(app, dataSql, options.now ?? (() => new Date()));
  mountAdmin(app, options);
  return app;
}

export const app = createApp();
