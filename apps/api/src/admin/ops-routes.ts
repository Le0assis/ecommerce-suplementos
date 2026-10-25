import { writeAudit } from "@pulso/db/audit";
import { loadCpfKeys } from "@pulso/db/cpf";
import { archiveAdminProduct, getAdminProduct, listAdminProducts, saveAdminProduct, type AdminProduct } from "@pulso/db/catalog";
import {
  adjustPoints,
  archiveBanner,
  archivePromotion,
  archiveScratch,
  getOrderDetail,
  hideUgc,
  hideVideo,
  listAdminCustomers,
  listBanners,
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
  writeCustomerCpf,
  saveBanner,
  saveLoyalty,
  saveNamed,
  savePromotion,
  saveQuizQuestion,
  saveScratch,
  saveUgc,
  saveVideo,
  type LoyaltySettings,
  type NamedRow,
  type ReviewAdmin,
} from "@pulso/db/resources";
import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import { z } from "zod";
import { invalidateCatalogCache } from "../catalog-source";
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

const customerPatch = z.object({
  pointsBalance: z.number().int().nonnegative().optional(),
  pointsLifetime: z.number().int().nonnegative().optional(),
  marketingOptIn: z.boolean().optional(),
  cpf: z.string().trim().max(14).optional(),
  subscriptions: z
    .array(z.object({ id: z.string().trim().min(1), status: z.enum(["ativa", "pausada", "cancelada"]) }))
    .optional(),
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
  await invalidateCatalogCache();
}

const slugField = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "O slug usa letras minúsculas e hífen.");

const namedSchema = z.object({
  slug: slugField.optional(),
  id: slugField.optional(),
  name: z.string().trim().min(1).max(80),
  blurb: z
    .union([z.string().trim().max(180), z.null()])
    .optional()
    .transform((value) => value || null),
  imageUrl: httpsUrl,
  position: z.number().int().nonnegative().default(0),
  kind: z.enum(["categoria", "objetivo"]).optional(),
});

function namedSlug(body: { slug?: string; id?: string }): string {
  const slug = body.slug || body.id;
  if (!slug) throw new HttpError(400, "Informe o slug.");
  return slug;
}

function presentNamed(row: NamedRow, kind: "categoria" | "objetivo") {
  return { id: row.slug, slug: row.slug, kind, name: row.name, blurb: row.blurb ?? "", imageUrl: row.imageUrl, position: row.position };
}

async function locateNamed(sql: AdminRuntime["sql"], key: string) {
  for (const table of ["categories", "goals"] as const) {
    const row = (await listNamed(sql, table)).find((item) => item.slug === key);
    if (row) return { table, row, kind: table === "categories" ? ("categoria" as const) : ("objetivo" as const) };
  }
  return null;
}

function presentReview(row: ReviewAdmin) {
  return {
    ...row,
    productId: row.productSlug,
    handle: row.handle ?? "",
    title: row.title ?? "",
    body: row.body ?? "",
    reply: row.reply ?? "",
    createdAt: row.createdAt ?? "",
  };
}

function lockedId(urlId: string, bodyId: string | undefined) {
  if (bodyId && bodyId !== urlId) throw new HttpError(409, "O identificador não muda.");
}

export function mountOps(admin: Hono, runtime: () => AdminRuntime): void {
  admin.get("/categories", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "categories");
    const kind = c.req.query("kind");
    const q = (c.req.query("q") ?? "").trim().toLowerCase();
    const categories = kind === "objetivo" ? [] : (await listNamed(ctx.sql, "categories")).map((row) => presentNamed(row, "categoria"));
    const goals = kind === "categoria" ? [] : (await listNamed(ctx.sql, "goals")).map((row) => presentNamed(row, "objetivo"));
    const items = [...categories, ...goals].filter((item) => !q || `${item.name} ${item.slug} ${item.blurb}`.toLowerCase().includes(q));
    return c.json({ items, total: items.length, page: 1, pageSize: items.length || 1 });
  });
  admin.post("/categories", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "categories");
    const body = parseInput(namedSchema, await readJson(c));
    const slug = namedSlug(body);
    const table = body.kind === "objetivo" ? "goals" : "categories";
    if (await locateNamed(ctx.sql, slug)) throw new HttpError(409, "Já existe uma categoria ou objetivo com esse slug.");
    const saved = await guard(() => saveNamed(ctx.sql, table, { slug, name: body.name, blurb: body.blurb ?? null, imageUrl: body.imageUrl ?? null, position: body.position }));
    const item = presentNamed(saved, table === "goals" ? "objetivo" : "categoria");
    await audit(ctx, actor, `${table}.save`, table, saved.slug, item);
    return c.json({ item }, 201);
  });
  admin.get("/categories/:slug", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "categories");
    const found = await locateNamed(ctx.sql, c.req.param("slug"));
    if (!found) throw new HttpError(404, "Categoria não encontrada.");
    return c.json({ item: presentNamed(found.row, found.kind) });
  });
  admin.patch("/categories/:slug", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "categories");
    const found = await locateNamed(ctx.sql, c.req.param("slug"));
    if (!found) throw new HttpError(404, "Categoria não encontrada.");
    const body = parseInput(namedSchema, await readJson(c));
    const slug = namedSlug({ slug: body.slug, id: body.id ?? found.row.slug });
    if (slug !== found.row.slug) throw new HttpError(409, "O slug não muda.");
    if (body.kind && (body.kind === "objetivo") !== (found.table === "goals")) throw new HttpError(409, "O tipo não muda.");
    const saved = await guard(() =>
      saveNamed(ctx.sql, found.table, { slug, name: body.name, blurb: body.blurb ?? null, imageUrl: body.imageUrl ?? null, position: body.position }),
    );
    const item = presentNamed(saved, found.kind);
    await audit(ctx, actor, `${found.table}.update`, found.table, saved.slug, item, presentNamed(found.row, found.kind));
    return c.json({ item });
  });
  admin.delete("/categories/:slug", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "categories");
    const found = await locateNamed(ctx.sql, c.req.param("slug"));
    if (!found) throw new HttpError(404, "Categoria não encontrada.");
    await guard(() => deleteNamed(ctx.sql, found.table, found.row.slug));
    await audit(ctx, actor, `${found.table}.delete`, found.table, found.row.slug, { deleted: true }, presentNamed(found.row, found.kind));
    return c.json({ ok: true });
  });

  admin.get("/goals", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "categories");
    const items = (await listNamed(ctx.sql, "goals")).map((row) => presentNamed(row, "objetivo"));
    return c.json({ items, total: items.length });
  });
  admin.post("/goals", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "categories");
    const body = parseInput(namedSchema, await readJson(c));
    const slug = namedSlug(body);
    if (await locateNamed(ctx.sql, slug)) throw new HttpError(409, "Já existe uma categoria ou objetivo com esse slug.");
    const saved = await guard(() => saveNamed(ctx.sql, "goals", { slug, name: body.name, blurb: body.blurb ?? null, imageUrl: body.imageUrl ?? null, position: body.position }));
    const item = presentNamed(saved, "objetivo");
    await audit(ctx, actor, "goals.save", "goals", saved.slug, item);
    return c.json({ item }, 201);
  });
  admin.get("/goals/:slug", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "categories");
    const found = await locateNamed(ctx.sql, c.req.param("slug"));
    if (!found || found.table !== "goals") throw new HttpError(404, "Objetivo não encontrado.");
    return c.json({ item: presentNamed(found.row, "objetivo") });
  });
  admin.patch("/goals/:slug", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "categories");
    const slug = c.req.param("slug");
    const current = (await listNamed(ctx.sql, "goals")).find((row) => row.slug === slug);
    if (!current) throw new HttpError(404, "Objetivo não encontrado.");
    const body = parseInput(namedSchema, await readJson(c));
    if (namedSlug({ slug: body.slug, id: body.id ?? slug }) !== slug) throw new HttpError(409, "O slug não muda.");
    const saved = await guard(() => saveNamed(ctx.sql, "goals", { slug, name: body.name, blurb: body.blurb ?? null, imageUrl: body.imageUrl ?? null, position: body.position }));
    const item = presentNamed(saved, "objetivo");
    await audit(ctx, actor, "goals.update", "goals", slug, item, presentNamed(current, "objetivo"));
    return c.json({ item });
  });
  admin.delete("/goals/:slug", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "categories");
    const slug = c.req.param("slug");
    if (!(await listNamed(ctx.sql, "goals")).some((row) => row.slug === slug)) throw new HttpError(404, "Objetivo não encontrado.");
    await guard(() => deleteNamed(ctx.sql, "goals", slug));
    await audit(ctx, actor, "goals.delete", "goals", slug, { deleted: true });
    return c.json({ ok: true });
  });

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
  admin.get("/promotions/:id", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "promotions");
    const item = (await listPromotions(ctx.sql)).find((row) => row.id === c.req.param("id"));
    if (!item) throw new HttpError(404, "Promoção não encontrada.");
    return c.json({ item });
  });
  admin.patch("/promotions/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "promotions");
    const current = (await listPromotions(ctx.sql)).find((row) => row.id === c.req.param("id"));
    if (!current) throw new HttpError(404, "Promoção não encontrada.");
    const body = parseInput(promotionSchema, await readJson(c));
    lockedId(current.id, body.id);
    const saved = await guard(() =>
      savePromotion(ctx.sql, {
        ...body,
        id: current.id,
        productId: body.targetType === "produto" ? body.productId : null,
        categoryId: body.targetType === "categoria" ? body.categoryId : null,
        startsAt: body.startsAt ?? null,
        endsAt: body.endsAt ?? null,
      }),
    );
    await audit(ctx, actor, "promotion.update", "promotion", saved.id, saved, current);
    return c.json({ item: saved });
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
  admin.get("/quiz/:id", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "quiz");
    const item = (await listQuiz(ctx.sql)).find((row) => row.id === c.req.param("id"));
    if (!item) throw new HttpError(404, "Pergunta não encontrada.");
    return c.json({ item });
  });
  admin.patch("/quiz/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "quiz");
    const current = (await listQuiz(ctx.sql)).find((row) => row.id === c.req.param("id"));
    if (!current) throw new HttpError(404, "Pergunta não encontrada.");
    const body = parseInput(quizSchema, await readJson(c));
    lockedId(current.id, body.id);
    const saved = await guard(() =>
      saveQuizQuestion(ctx.sql, {
        id: current.id,
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
    await audit(ctx, actor, "quiz.update", "quiz_question", saved.id, saved, current);
    return c.json({ item: saved });
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
  admin.get("/scratch-prizes/:id", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "scratch-prizes");
    const item = (await listScratch(ctx.sql)).find((row) => row.id === c.req.param("id"));
    if (!item) throw new HttpError(404, "Prêmio não encontrado.");
    return c.json({ item });
  });
  admin.patch("/scratch-prizes/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "scratch-prizes");
    const current = (await listScratch(ctx.sql)).find((row) => row.id === c.req.param("id"));
    if (!current) throw new HttpError(404, "Prêmio não encontrado.");
    const body = parseInput(scratchSchema, await readJson(c));
    lockedId(current.id, body.id);
    const saved = await guard(() => saveScratch(ctx.sql, { ...body, id: current.id, couponCode: body.couponCode ? body.couponCode.toUpperCase() : null }));
    await audit(ctx, actor, "scratch.update", "scratch_prize", saved.id, saved, current);
    return c.json({ item: saved });
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
  admin.get("/banners/:id", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "banners");
    const item = (await listBanners(ctx.sql)).find((row) => row.id === c.req.param("id"));
    if (!item) throw new HttpError(404, "Banner não encontrado.");
    return c.json({ item });
  });
  admin.patch("/banners/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "banners");
    const current = (await listBanners(ctx.sql)).find((row) => row.id === c.req.param("id"));
    if (!current) throw new HttpError(404, "Banner não encontrado.");
    const body = parseInput(bannerSchema, await readJson(c));
    lockedId(current.id, body.id);
    const saved = await guard(() =>
      saveBanner(ctx.sql, { ...body, id: current.id, startsAt: body.startsAt ?? null, endsAt: body.endsAt ?? null }),
    );
    await audit(ctx, actor, "banner.update", "banner", saved.id, saved, current);
    return c.json({ item: saved });
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
  admin.get("/ugc/:id", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "ugc");
    const item = (await listUgc(ctx.sql, true)).find((row) => row.id === c.req.param("id"));
    if (!item) throw new HttpError(404, "Post social não encontrado.");
    return c.json({ item });
  });
  admin.patch("/ugc/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "ugc");
    const current = (await listUgc(ctx.sql, true)).find((row) => row.id === c.req.param("id"));
    if (!current) throw new HttpError(404, "Post social não encontrado.");
    const body = parseInput(ugcSchema, await readJson(c));
    lockedId(current.id, body.id);
    const saved = await guard(() => saveUgc(ctx.sql, { ...body, id: current.id }));
    await audit(ctx, actor, "ugc.update", "ugc", saved.id, saved, current);
    return c.json({ item: saved });
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
  admin.get("/videos/:id", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "videos");
    const key = c.req.param("id");
    const item = (await listVideos(ctx.sql, true)).find((row) => row.id === key || row.slug === key);
    if (!item) throw new HttpError(404, "Vídeo não encontrado.");
    return c.json({ item });
  });
  admin.patch("/videos/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "videos");
    const key = c.req.param("id");
    const current = (await listVideos(ctx.sql, true)).find((row) => row.id === key || row.slug === key);
    if (!current) throw new HttpError(404, "Vídeo não encontrado.");
    const body = parseInput(videoSchema, await readJson(c));
    lockedId(current.id, body.id);
    if (body.slug !== current.slug) throw new HttpError(409, "O slug não muda.");
    const saved = await guard(() => saveVideo(ctx.sql, { ...body, id: current.id }));
    await audit(ctx, actor, "video.update", "video", saved.id, saved, current);
    return c.json({ item: saved });
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
    const items = (await listReviews(ctx.sql, status || undefined)).map(presentReview);
    return c.json({ items, total: items.length });
  });
  admin.get("/reviews/:id", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "reviews");
    const item = (await listReviews(ctx.sql)).find((row) => row.id === c.req.param("id"));
    if (!item) throw new HttpError(404, "Avaliação não encontrada.");
    return c.json({ item: presentReview(item) });
  });
  admin.patch("/reviews/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "reviews");
    const body = parseInput(reviewPatch, await readJson(c));
    const saved = await guard(() => patchReview(ctx.sql, c.req.param("id"), body));
    await audit(ctx, actor, "review.update", "review", saved.id, presentReview(saved));
    return c.json({ item: presentReview(saved) });
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
    const items = await listOrders(ctx.sql);
    return c.json({ items, total: items.length });
  });
  admin.get("/orders/:id", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "orders");
    const item = await getOrderDetail(ctx.sql, c.req.param("id"));
    if (!item) throw new HttpError(404, "Pedido não encontrado.");
    return c.json({ item });
  });
  admin.patch("/orders/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "orders");
    const body = parseInput(orderPatch, await readJson(c));
    await guard(() => patchOrder(ctx.sql, c.req.param("id"), body));
    const saved = await getOrderDetail(ctx.sql, c.req.param("id"));
    if (!saved) throw new HttpError(404, "Pedido não encontrado.");
    await audit(ctx, actor, "order.update", "order", saved.id, saved);
    return c.json({ item: saved });
  });

  admin.get("/customers", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "customers");
    const items = await listAdminCustomers(ctx.sql);
    return c.json({ items, total: items.length });
  });
  admin.get("/customers/:id", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "customers");
    const item = (await listAdminCustomers(ctx.sql)).find((row) => row.id === c.req.param("id"));
    if (!item) throw new HttpError(404, "Cliente não encontrado.");
    return c.json({ item });
  });
  admin.patch("/customers/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "customers");
    const current = (await listAdminCustomers(ctx.sql)).find((row) => row.id === c.req.param("id"));
    if (!current) throw new HttpError(404, "Cliente não encontrado.");
    const body = parseInput(customerPatch, await readJson(c));
    if (body.pointsBalance !== undefined && body.pointsBalance !== current.pointsBalance) {
      await guard(() => adjustPoints(ctx.sql, current.id, body.pointsBalance! - current.pointsBalance, "ajuste do painel"));
    }
    if (body.pointsLifetime !== undefined) {
      if (body.pointsLifetime < (body.pointsBalance ?? current.pointsBalance)) {
        throw new HttpError(400, "Os pontos acumulados não ficam abaixo do saldo.");
      }
      await ctx.sql.query("update customers set points_lifetime = $2 where id = $1", [current.id, body.pointsLifetime]);
    }
    if (typeof body.marketingOptIn === "boolean") {
      await ctx.sql.query("update customers set marketing_opt_in = $2 where id = $1", [current.id, body.marketingOptIn]);
    }
    if (body.cpf) {
      const keys = loadCpfKeys();
      if (!keys) throw new HttpError(503, "CPF cifrado indisponível.");
      await guard(() => writeCustomerCpf(ctx.sql, current.id, body.cpf!, keys));
    }
    for (const subscription of body.subscriptions ?? []) {
      if (!current.subscriptions.some((item) => item.id === subscription.id)) throw new HttpError(404, "Assinatura não encontrada.");
      await guard(() => patchSubscription(ctx.sql, subscription.id, subscription.status));
    }
    const saved = (await listAdminCustomers(ctx.sql)).find((row) => row.id === current.id);
    if (!saved) throw new HttpError(404, "Cliente não encontrado.");
    await audit(ctx, actor, "customer.update", "customer", saved.id, saved, current);
    return c.json({ item: saved });
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
    const json = await readJson(c);
    const hasSlug = typeof json === "object" && json !== null && "slug" in json && typeof json.slug === "string";
    const body = hasSlug ? parseInput(productSchema, json) : await kitFromShort(ctx, json);
    if (await getAdminProduct(ctx.sql, body.slug)) throw new HttpError(409, "Já existe um produto com esse slug.");
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
  admin.patch("/kits/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "kits");
    const current = await getAdminProduct(ctx.sql, c.req.param("id"));
    if (!current?.isKit) throw new HttpError(404, "Kit não encontrado.");
    const json = await readJson(c);
    const hasSlug = typeof json === "object" && json !== null && "slug" in json && typeof (json as { slug?: unknown }).slug === "string";
    const body = hasSlug ? parseInput(productSchema, json) : { ...(await kitFromShort(ctx, json)), slug: current.slug };
    if (body.slug !== current.slug) throw new HttpError(409, "O slug não muda.");
    if (hasSlug) lockedId(current.id, (json as { id?: string }).id);
    let saved: AdminProduct;
    try {
      saved = await saveAdminProduct(ctx.sql, toStoredProduct({ ...body, isKit: true }, current.id));
    } catch (error) {
      raiseCatalog(error);
    }
    await audit(ctx, actor, "kit.update", "product", saved.id, saved, current);
    return c.json({ item: saved });
  });
  admin.delete("/kits/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "kits");
    const current = await getAdminProduct(ctx.sql, c.req.param("id"));
    if (!current?.isKit) throw new HttpError(404, "Kit não encontrado.");
    let saved: AdminProduct;
    try {
      saved = await archiveAdminProduct(ctx.sql, current.id);
    } catch (error) {
      raiseCatalog(error);
    }
    await audit(ctx, actor, "kit.archive", "product", saved.id, saved, current);
    return c.json({ item: saved, archived: true });
  });
}

const shortKitSchema = z.object({
  name: z.string().trim().min(1).max(120),
  discountPercent: z.number().int().min(0).max(12).default(0),
  kitItems: z.array(z.object({ productId: z.string().trim().min(1).max(80), quantity: z.number().int().positive() })).min(1).max(12),
});

function kitSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

async function kitFromShort(ctx: AdminRuntime, json: unknown) {
  const input = parseInput(shortKitSchema, json);
  const seen = new Set<string>();
  const rows = [];
  for (const item of input.kitItems) {
    if (seen.has(item.productId)) throw new HttpError(400, "O mesmo produto entrou duas vezes no kit.");
    seen.add(item.productId);
    const product = await getAdminProduct(ctx.sql, item.productId);
    if (!product || product.isKit) throw new HttpError(400, "O kit só aponta para produto que não é kit.");
    if (!product.variants.length) throw new HttpError(400, `${product.name} não tem preço.`);
    rows.push({ product, quantity: item.quantity });
  }
  const sum = rows.reduce((total, item) => total + Math.min(...item.product.variants.map((variant) => variant.priceCents)) * item.quantity, 0);
  const priceCents = Math.round((sum * (100 - input.discountPercent)) / 100);
  const stock = Math.min(
    ...rows.map((item) => Math.floor(item.product.flavors.reduce((total, flavor) => total + flavor.stock, 0) / item.quantity)),
  );
  const slug = kitSlug(input.name);
  if (!slug) throw new HttpError(400, "O kit precisa de nome.");
  const sku = `KIT-${slug}`.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 48);
  return parseInput(productSchema, {
    slug,
    name: input.name,
    line: "Kit",
    description: "Kit montado no admin.",
    categoryId: "kit",
    status: "rascunho",
    isKit: true,
    kitItems: rows.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
    flavors: [{ id: "combo", name: "Combo", tagline: "Montado no admin.", hex: "#d6ff3c", family: "neutro", stock: Math.max(0, stock) }],
    variants: [
      {
        flavorId: "combo",
        size: "Kit",
        sku,
        priceCents,
        compareAtCents: input.discountPercent > 0 ? sum : null,
        stock: Math.max(0, stock),
        weightGrams: 0,
        servings: 1,
      },
    ],
    label: {
      registration: "NI-DEMO-KIT",
      category: "Suplemento alimentar",
      serving: "Conforme cada produto do kit",
      servingsPerContainer: 1,
      ingredients: "Ver o rótulo de cada produto do kit.",
      allergens: "Ver alergênicos de cada produto do kit.",
      warnings: ["Este produto não é um medicamento."],
      nutrition: [],
      manufacturer: "PULSO Indústria de Alimentos Ltda. (empresa fictícia deste protótipo).",
    },
  });
}
