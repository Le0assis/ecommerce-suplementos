import { writeAudit } from "@pulso/db/audit";
import { getAdminProduct, listAdminProducts, saveAdminProduct, type AdminProduct } from "@pulso/db/catalog";
import {
  adjustPoints,
  archiveBanner,
  archivePromotion,
  archiveScratch,
  hideUgc,
  hideVideo,
  listBanners,
  listCustomers,
  deleteNamed,
  deleteQuizQuestion,
  listNamed,
  listOrders,
  listPromotions,
  listQuiz,
  listReviews,
  listScratch,
  listSubscriptions,
  listUgc,
  listVideos,
  patchOrder,
  patchReview,
  patchSubscription,
  readLoyalty,
  saveBanner,
  saveLoyalty,
  saveNamed,
  savePromotion,
  saveQuizQuestion,
  saveScratch,
  saveUgc,
  saveVideo,
  type LoyaltySettings,
} from "@pulso/db/resources";
import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import { z } from "zod";
import { guard, HttpError, parseInput, raiseCatalog, readJson, requireActor, type Actor, type AdminRuntime } from "./http";
import { toStoredProduct } from "./product-routes";
import { productSchema } from "./schemas";

const nullableDate = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value === null || value === "") return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Data inválida." });
      return z.NEVER;
    }
    return date.toISOString();
  });

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "A cor precisa ser um hex de 6 dígitos.");
const httpsUrl = z
  .union([
    z.string().url().refine((value) => value.startsWith("https://"), "A imagem precisa ser https."),
    z.literal(""),
    z.null(),
  ])
  .optional()
  .transform((value) => (value ? value : null));

const namedSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "O slug usa letras minúsculas e hífen."),
  name: z.string().trim().min(1).max(80),
  blurb: z.string().trim().max(180).nullable().optional().default(null),
  imageUrl: httpsUrl,
  position: z.number().int().nonnegative().default(0),
});

const promotionSchema = z
  .object({
    id: z.string().trim().min(1).max(80).optional(),
    name: z.string().trim().min(1).max(120),
    kind: z.enum(["percent", "fixed_cents", "compare_at"]),
    value: z.number().int().nonnegative(),
    targetType: z.enum(["produto", "categoria"]),
    productId: z.string().trim().min(1).nullable().optional().default(null),
    categoryId: z.string().trim().min(1).nullable().optional().default(null),
    startsAt: nullableDate,
    endsAt: nullableDate,
    badge: z.string().trim().max(40).nullable().optional().default(null),
    active: z.boolean().default(true),
  })
  .superRefine((promo, ctx) => {
    if (promo.kind === "percent" && (promo.value < 1 || promo.value > 30)) {
      ctx.addIssue({ code: "custom", message: "A promoção percentual fica entre 1% e 30%.", path: ["value"] });
    }
    if (promo.targetType === "produto" && !promo.productId) ctx.addIssue({ code: "custom", message: "Escolha o produto.", path: ["productId"] });
    if (promo.targetType === "categoria" && !promo.categoryId) ctx.addIssue({ code: "custom", message: "Escolha a categoria.", path: ["categoryId"] });
  });

const quizSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  prompt: z.string().trim().min(1).max(240),
  answerKey: z.string().trim().min(1).max(40),
  position: z.number().int().nonnegative(),
  options: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(80).optional(),
        label: z.string().trim().min(1).max(120),
        value: z.string().trim().min(1).max(40),
        position: z.number().int().nonnegative().optional(),
        weights: z
          .object({
            products: z.record(z.string(), z.number()).optional(),
            goals: z.record(z.string(), z.number()).optional(),
          })
          .default({}),
      }),
    )
    .min(1)
    .max(12),
});

const loyaltySchema = z.object({
  pointsPerReal: z.number().int().nonnegative(),
  pixPointsBonus: z.number().nonnegative(),
  pointValueCents: z.number().int().nonnegative(),
  maxPointsRedeemRatio: z.number().min(0).max(1),
  welcomePoints: z.number().int().nonnegative(),
  freeShippingCents: z.number().int().nonnegative(),
  pixDiscountPercent: z.number().int().min(0).max(100),
  kitDiscountPercent: z.number().int().min(0).max(30),
  subscriptionDefaultPercent: z.number().int().min(0).max(100),
  referrerPoints: z.number().int().nonnegative(),
  referredPoints: z.number().int().nonnegative(),
  levels: z.array(z.record(z.string(), z.unknown())).max(8),
});

const scratchSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  label: z.string().trim().min(1).max(80),
  detail: z.string().trim().min(1).max(240),
  weight: z.number().int().positive(),
  couponCode: z.string().trim().min(1).max(32).nullable().optional().default(null),
  points: z.number().int().nonnegative().nullable().optional().default(null),
  active: z.boolean().default(true),
  position: z.number().int().nonnegative().default(0),
});

const bannerSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  slot: z.enum(["hero", "marquee", "destaque"]),
  title: z.string().trim().min(1).max(160),
  subtitle: z.string().trim().max(240).nullable().optional().default(null),
  href: z
    .union([z.string().trim().max(200), z.null(), z.literal("")])
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === null || value === "") return null;
      if (isSafeBannerHref(value)) return value;
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "O link do banner precisa ser https ou um caminho do site." });
      return z.NEVER;
    }),
  imageUrl: httpsUrl,
  accent: z.union([hex, z.null()]).optional().default(null),
  position: z.number().int().nonnegative().default(0),
  active: z.boolean().default(true),
  startsAt: nullableDate,
  endsAt: nullableDate,
});

const ugcSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  author: z.string().trim().min(1).max(80),
  handle: z.string().trim().min(1).max(40),
  caption: z.string().trim().min(1).max(280),
  likes: z.number().int().nonnegative().default(0),
  accent: hex,
  productId: z.string().trim().min(1).nullable().optional().default(null),
  position: z.number().int().nonnegative().default(0),
  hidden: z.boolean().default(false),
});

const videoSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(120),
  caption: z.string().trim().min(1).max(180),
  duration: z.string().trim().min(1).max(12),
  frames: z.tuple([hex, hex, hex]),
  transcript: z.array(z.string().trim().min(1).max(240)).min(1).max(12),
  position: z.number().int().nonnegative().default(0),
  hidden: z.boolean().default(false),
});

const reviewPatch = z.object({
  status: z.enum(["pendente", "aprovada", "oculta"]),
  reply: z.string().trim().max(800).nullable().optional().default(null),
});

const orderPatch = z.object({
  status: z.enum(["pagamento_pendente", "pago", "separando", "enviado", "entregue", "cancelado"]).optional(),
  trackingCode: z.string().trim().max(40).nullable().optional(),
  shipmentStatus: z.string().trim().max(40).nullable().optional(),
});

const pointsPatch = z.object({
  delta: z.number().int(),
  reason: z.string().trim().min(1).max(160),
});

const subscriptionPatch = z.object({
  status: z.enum(["ativa", "pausada", "cancelada"]),
});

function isSafeBannerHref(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !value.includes(":")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

async function audit(ctx: AdminRuntime, actor: Actor, action: string, entity: string, entityId: string, after: unknown, before?: unknown) {
  await writeAudit(ctx.sql, { actorId: actor.id, action, entity, entityId, before, after });
}

export function mountOps(admin: Hono, runtime: () => AdminRuntime): void {
  for (const table of ["categories", "goals"] as const) {
    const resource = table === "categories" ? "categories" : "categories";
    admin.get(`/${table}`, async (c) => {
      const ctx = runtime();
      await requireActor(c, ctx, resource);
      return c.json({ items: await listNamed(ctx.sql, table) });
    });
    admin.post(`/${table}`, async (c) => {
      const ctx = runtime();
      const actor = await requireActor(c, ctx, resource);
      const body = parseInput(namedSchema, await readJson(c));
      const saved = await guard(() => saveNamed(ctx.sql, table, body));
      await audit(ctx, actor, `${table}.save`, table, saved.slug, saved);
      return c.json({ item: saved }, 201);
    });
    admin.delete(`/${table}/:slug`, async (c) => {
      const ctx = runtime();
      const actor = await requireActor(c, ctx, resource);
      const slug = c.req.param("slug");
      await guard(() => deleteNamed(ctx.sql, table, slug));
      await audit(ctx, actor, `${table}.delete`, table, slug, { deleted: true });
      return c.json({ ok: true });
    });
  }

  admin.get("/promotions", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "promotions");
    return c.json({ items: await listPromotions(ctx.sql) });
  });
  admin.post("/promotions", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "promotions");
    const body = parseInput(promotionSchema, await readJson(c));
    const saved = await guard(() =>
      savePromotion(ctx.sql, {
        ...body,
        id: body.id || randomUUID(),
        productId: body.targetType === "produto" ? body.productId : null,
        categoryId: body.targetType === "categoria" ? body.categoryId : null,
        startsAt: body.startsAt ?? null,
        endsAt: body.endsAt ?? null,
      }),
    );
    await audit(ctx, actor, "promotion.save", "promotion", saved.id, saved);
    return c.json({ item: saved }, 201);
  });
  admin.delete("/promotions/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "promotions");
    const saved = await guard(() => archivePromotion(ctx.sql, c.req.param("id")));
    await audit(ctx, actor, "promotion.archive", "promotion", saved.id, saved);
    return c.json({ item: saved, archived: true });
  });

  admin.get("/quiz", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "quiz");
    return c.json({ items: await listQuiz(ctx.sql) });
  });
  admin.post("/quiz", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "quiz");
    const body = parseInput(quizSchema, await readJson(c));
    const saved = await guard(() =>
      saveQuizQuestion(ctx.sql, {
        id: body.id || randomUUID(),
        prompt: body.prompt,
        answerKey: body.answerKey,
        position: body.position,
        options: body.options.map((option, index) => ({
          id: option.id || "",
          label: option.label,
          value: option.value,
          position: option.position ?? index,
          weights: option.weights,
        })),
      }),
    );
    await audit(ctx, actor, "quiz.save", "quiz_question", saved.id, saved);
    return c.json({ item: saved }, 201);
  });
  admin.delete("/quiz/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "quiz");
    const id = c.req.param("id");
    await guard(() => deleteQuizQuestion(ctx.sql, id));
    await audit(ctx, actor, "quiz.delete", "quiz_question", id, { deleted: true });
    return c.json({ ok: true });
  });

  admin.get("/settings/loyalty", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "loyalty");
    return c.json({ item: await readLoyalty(ctx.sql) });
  });
  admin.patch("/settings/loyalty", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "loyalty");
    const body = parseInput(loyaltySchema, await readJson(c));
    const saved = await guard(() => saveLoyalty(ctx.sql, { ...body, id: "padrao", updatedAt: null } satisfies LoyaltySettings));
    await audit(ctx, actor, "loyalty.update", "loyalty_settings", "padrao", saved);
    return c.json({ item: saved });
  });

  admin.get("/scratch-prizes", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "scratch-prizes");
    return c.json({ items: await listScratch(ctx.sql) });
  });
  admin.post("/scratch-prizes", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "scratch-prizes");
    const body = parseInput(scratchSchema, await readJson(c));
    const saved = await guard(() => saveScratch(ctx.sql, { ...body, id: body.id || randomUUID(), couponCode: body.couponCode ? body.couponCode.toUpperCase() : null }));
    await audit(ctx, actor, "scratch.save", "scratch_prize", saved.id, saved);
    return c.json({ item: saved }, 201);
  });
  admin.delete("/scratch-prizes/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "scratch-prizes");
    const saved = await guard(() => archiveScratch(ctx.sql, c.req.param("id")));
    await audit(ctx, actor, "scratch.archive", "scratch_prize", saved.id, saved);
    return c.json({ item: saved, archived: true });
  });

  admin.get("/banners", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "banners");
    return c.json({ items: await listBanners(ctx.sql) });
  });
  admin.post("/banners", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "banners");
    const body = parseInput(bannerSchema, await readJson(c));
    const saved = await guard(() =>
      saveBanner(ctx.sql, { ...body, id: body.id || randomUUID(), startsAt: body.startsAt ?? null, endsAt: body.endsAt ?? null }),
    );
    await audit(ctx, actor, "banner.save", "banner", saved.id, saved);
    return c.json({ item: saved }, 201);
  });
  admin.delete("/banners/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "banners");
    const saved = await guard(() => archiveBanner(ctx.sql, c.req.param("id")));
    await audit(ctx, actor, "banner.archive", "banner", saved.id, saved);
    return c.json({ item: saved, archived: true });
  });

  admin.get("/ugc", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "ugc");
    return c.json({ items: await listUgc(ctx.sql, true) });
  });
  admin.post("/ugc", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "ugc");
    const body = parseInput(ugcSchema, await readJson(c));
    const saved = await guard(() => saveUgc(ctx.sql, { ...body, id: body.id || randomUUID() }));
    await audit(ctx, actor, "ugc.save", "ugc", saved.id, saved);
    return c.json({ item: saved }, 201);
  });
  admin.delete("/ugc/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "ugc");
    const saved = await guard(() => hideUgc(ctx.sql, c.req.param("id")));
    await audit(ctx, actor, "ugc.archive", "ugc", saved.id, saved);
    return c.json({ item: saved, archived: true });
  });

  admin.get("/videos", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "videos");
    return c.json({ items: await listVideos(ctx.sql, true) });
  });
  admin.post("/videos", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "videos");
    const body = parseInput(videoSchema, await readJson(c));
    const saved = await guard(() => saveVideo(ctx.sql, { ...body, id: body.id || body.slug }));
    await audit(ctx, actor, "video.save", "video", saved.id, saved);
    return c.json({ item: saved }, 201);
  });
  admin.delete("/videos/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "videos");
    const saved = await guard(() => hideVideo(ctx.sql, c.req.param("id")));
    await audit(ctx, actor, "video.archive", "video", saved.id, saved);
    return c.json({ item: saved, archived: true });
  });

  admin.get("/reviews", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "reviews");
    const status = c.req.query("status");
    return c.json({ items: await listReviews(ctx.sql, status || undefined) });
  });
  admin.patch("/reviews/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "reviews");
    const body = parseInput(reviewPatch, await readJson(c));
    const saved = await guard(() => patchReview(ctx.sql, c.req.param("id"), body));
    await audit(ctx, actor, "review.update", "review", saved.id, saved);
    return c.json({ item: saved });
  });
  admin.delete("/reviews/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "reviews");
    const saved = await guard(() => patchReview(ctx.sql, c.req.param("id"), { status: "oculta", reply: null }));
    await audit(ctx, actor, "review.archive", "review", saved.id, saved);
    return c.json({ item: saved, archived: true });
  });

  admin.get("/orders", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "orders");
    return c.json({ items: await listOrders(ctx.sql) });
  });
  admin.patch("/orders/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "orders");
    const body = parseInput(orderPatch, await readJson(c));
    const saved = await guard(() => patchOrder(ctx.sql, c.req.param("id"), body));
    await audit(ctx, actor, "order.update", "order", saved.id, saved);
    return c.json({ item: saved });
  });

  admin.get("/customers", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "customers");
    return c.json({ items: await listCustomers(ctx.sql) });
  });
  admin.patch("/customers/:id/points", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "customers");
    const body = parseInput(pointsPatch, await readJson(c));
    const saved = await guard(() => adjustPoints(ctx.sql, c.req.param("id"), body.delta, body.reason));
    await audit(ctx, actor, "customer.points", "customer", saved.id, { delta: body.delta, balance: saved.pointsBalance });
    return c.json({ item: saved });
  });

  admin.get("/subscriptions", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "customers");
    return c.json({ items: await listSubscriptions(ctx.sql) });
  });
  admin.patch("/subscriptions/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "customers");
    const body = parseInput(subscriptionPatch, await readJson(c));
    const saved = await guard(() => patchSubscription(ctx.sql, c.req.param("id"), body.status));
    await audit(ctx, actor, "subscription.update", "subscription", saved.id, saved);
    return c.json({ item: saved });
  });
  admin.delete("/subscriptions/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "customers");
    const saved = await guard(() => patchSubscription(ctx.sql, c.req.param("id"), "cancelada"));
    await audit(ctx, actor, "subscription.archive", "subscription", saved.id, saved);
    return c.json({ item: saved, archived: true });
  });

  admin.get("/kits", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "kits");
    const result = await listAdminProducts(ctx.sql, { page: 1, pageSize: 100, q: "", status: "todos", kitsOnly: true });
    return c.json(result);
  });
  admin.post("/kits", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "kits");
    const body = parseInput(productSchema, await readJson(c));
    let saved: AdminProduct;
    try {
      saved = await saveAdminProduct(ctx.sql, toStoredProduct({ ...body, isKit: true }));
    } catch (error) {
      raiseCatalog(error);
    }
    await audit(ctx, actor, "kit.create", "product", saved.id, saved);
    return c.json({ item: saved }, 201);
  });
  admin.get("/kits/:id", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "kits");
    const item = await getAdminProduct(ctx.sql, c.req.param("id"));
    if (!item?.isKit) throw new HttpError(404, "Kit não encontrado.");
    return c.json({ item });
  });
}
