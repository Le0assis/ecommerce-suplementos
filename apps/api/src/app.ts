import { coupons, getInfluencer, getPost, getReviews, influencers, posts, ugc } from "@pulso/data";
import { listInfluencers, readPublicPosts, toPublicInfluencer } from "@pulso/db/content";
import { couponBlockReason, getAdminCoupon, listAdvertisedCoupons, readPublicCoupons, type AdminCoupon } from "@pulso/db/catalog";
import { getPool } from "@pulso/db/pool";
import { listBanners, listUgc, listVideos, readLoyalty, readPublicReviews, ugcPublic } from "@pulso/db/resources";
import { fromPgPool, type Sql, type SqlClient } from "@pulso/db/sql";
import {
  creatinePlan,
  findCoupon,
  proteinPlan,
  quizResult,
  sandboxCharge,
  shippingRates,
  type Coupon,
  type GoalId,
  type PaymentGateway,
  type PaymentMethod,
  type QuizAnswers,
} from "@pulso/domain";
import { Hono } from "hono";
import { clientIp, HttpError } from "./admin/http";
import { applyPublicCors } from "./cors";
import { customerPointAccount, mountAccount } from "./account-routes";
import { buildCheckoutQuote, buildCheckoutSimulation, parseCheckoutQuote, parseCheckoutSimulate } from "./checkout-quote";
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

function publicInfluencer<T extends { slug: string }>(influencer: T): T & { path: string } {
  return { ...influencer, path: `/atletas/${influencer.slug}` };
}

function publicPost<T extends { slug: string; author?: string; authorSlug?: string | null; authorAvatar?: string | null; authorBio?: string | null }>(
  post: T,
): T & { path: string; author: string; authorSlug: string | null; authorAvatar: string | null; authorBio: string | null } {
  return {
    ...post,
    author: post.author || "Redação PULSO",
    authorSlug: post.authorSlug ?? null,
    authorAvatar: post.authorAvatar ?? null,
    authorBio: post.authorBio ?? null,
    path: `/blog/${post.slug}`,
  };
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
  const dataSql = (): SqlClient | null => {
    if (options.sql) return options.sql;
    if (process.env.API_DATA_SOURCE === "postgres" && process.env.DATABASE_URL) return fromPgPool(getPool());
    return null;
  };
  const app = new Hono();

  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/v1/admin")) return next();
    const blocked = applyPublicCors(c);
    if (blocked) return blocked;
    await next();
  });

  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/v1/admin")) return next();
    if (c.req.method === "POST") {
      const ip = clientIp(c);
      if (!ip) return c.json({ error: "Não deu para identificar o IP." }, 503);
      if (limited(ip)) return c.json({ error: "Calma. Muitas tentativas por minuto." }, 429);
    }
    await next();
  });

  app.onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json(error.fields ? { error: error.message, fields: error.fields } : { error: error.message }, error.status);
    }
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
  c.header("Cache-Control", "no-store");
  return c.json(loaded);
});

app.get("/v1/products/:slug", async (c) => {
  c.header("Cache-Control", "no-store");
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
  c.header("Cache-Control", "no-store");
  const normalized = q.trim().toLowerCase();
  const products = loaded.products.filter((product) =>
    `${product.name} ${product.line} ${product.flavors.map((flavor) => flavor.name).join(" ")}`.toLowerCase().includes(normalized),
  );
  return c.json({ source: loaded.source, products });
});

  app.get("/v1/influencers", async (c) => {
    const sql = dataSql();
    if (!sql) return c.json({ source: "mock", influencers: influencers.map(publicInfluencer) });
    const rows = await listInfluencers(sql, false);
    return c.json({ source: "postgres", influencers: rows.map((row) => publicInfluencer(toPublicInfluencer(row))) });
  });
  app.get("/v1/influencers/:slug", async (c) => {
    const sql = dataSql();
    if (!sql) {
      const influencer = getInfluencer(c.req.param("slug"));
      if (!influencer) return c.json({ error: "Atleta não encontrado." }, 404);
      return c.json({ source: "mock", influencer: publicInfluencer(influencer) });
    }
    const row = (await listInfluencers(sql, false)).find((item) => item.slug === c.req.param("slug"));
    if (!row) return c.json({ error: "Atleta não encontrado." }, 404);
    return c.json({ source: "postgres", influencer: publicInfluencer(toPublicInfluencer(row)) });
  });
  app.get("/v1/posts", async (c) => {
    const sql = dataSql();
    if (!sql) return c.json({ source: "mock", posts: posts.map(publicPost) });
    return c.json({ source: "postgres", posts: (await readPublicPosts(sql, c.req.query("influencer") || undefined)).map(publicPost) });
  });
  app.get("/v1/posts/:slug", async (c) => {
    const sql = dataSql();
    if (!sql) {
      const post = getPost(c.req.param("slug"));
      if (!post) return c.json({ error: "Texto não encontrado." }, 404);
      return c.json({ source: "mock", post: publicPost(post) });
    }
    const post = (await readPublicPosts(sql)).find((item) => item.slug === c.req.param("slug"));
    if (!post) return c.json({ error: "Texto não encontrado." }, 404);
    return c.json({ source: "postgres", post: publicPost(post) });
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
    const sql = dataSql();
    if (!sql) {
      return c.json({
        coupons: coupons.filter((coupon) => coupon.active && coupon.public).map(({ code, label, kind, percent }) => ({ code, label, kind, percent })),
      });
    }
    const listed = await listAdvertisedCoupons(sql);
    return c.json({ coupons: listed ?? [] });
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

app.post("/v1/checkout/quote", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = parseCheckoutQuote(body);
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const quote = await buildCheckoutQuote(parsed, dataSql(), await customerPointAccount(c, dataSql(), options));
  if ("error" in quote) return c.json(quote.code ? { error: quote.error, code: quote.code } : { error: quote.error }, quote.status);
  c.header("cache-control", "no-store");
  return c.json(quote);
});

app.post("/v1/checkout/simulate", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = parseCheckoutSimulate(body);
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const quote = await buildCheckoutSimulation(parsed, dataSql(), await customerPointAccount(c, dataSql(), options));
  if ("error" in quote) {
    return c.json(
      {
        error: quote.error,
        ...(quote.code ? { code: quote.code } : {}),
        ...(quote.errors ? { errors: quote.errors } : {}),
      },
      quote.status,
    );
  }
  c.header("cache-control", "no-store");
  return c.json(quote);
});

  mountAccount(app, dataSql, options);
  mountPublicDrops(app, dataSql, options.now ?? (() => new Date()));
  mountAdmin(app, options);
  return app;
}

export const app = createApp();
