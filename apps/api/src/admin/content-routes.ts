import { writeAudit } from "@pulso/db/audit";
import { archiveInfluencer, archivePost, deleteAuthor, listAuthors, listInfluencers, listPosts, saveAuthor, saveInfluencer, savePost } from "@pulso/db/content";
import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import { z } from "zod";
import { invalidateCatalogCache } from "../catalog-source";
import { guard, HttpError, parseInput, readJson, requireActor, type Actor, type AdminRuntime } from "./http";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "A cor precisa ser um hex de 6 dígitos.");
const httpsOrNull = z
  .union([z.string().url().refine((value) => value.startsWith("https://"), "O link precisa ser https."), z.literal(""), z.null()])
  .optional()
  .transform((value) => (value ? value : null));

const influencerSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(80),
  handle: z.string().trim().min(1).max(40),
  instagramUrl: httpsOrNull,
  city: z.string().trim().max(80).default(""),
  sport: z.string().trim().max(80).default(""),
  bio: z.string().trim().max(600).default(""),
  story: z.string().trim().max(800).default(""),
  followers: z.string().trim().max(40).default(""),
  accent: hex,
  discountPercent: z.number().int().min(0).max(30).nullable().optional().default(null),
  active: z.boolean().default(true),
  couponCode: z.string().trim().max(32).nullable().optional().default(null),
  productIds: z.array(z.string().trim().min(1)).max(20).default([]),
  quotes: z
    .array(z.object({ id: z.string().optional(), body: z.string().trim().min(1).max(240), position: z.number().int().optional() }))
    .max(8)
    .default([]),
  images: z
    .array(
      z.object({
        id: z.string().optional(),
        url: httpsOrNull,
        alt: z.string().trim().min(1, "A foto precisa de texto alternativo.").max(200),
        caption: z.string().trim().max(180).nullable().optional().default(null),
        instagramPostUrl: httpsOrNull,
        fallbackHex: z.union([hex, z.null()]).optional().default(null),
        position: z.number().int().optional(),
      }),
    )
    .max(12)
    .default([]),
});

const authorSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(80),
  photoUrl: httpsOrNull,
  bio: z.string().trim().max(400).nullable().optional().default(null),
  influencerId: z.string().trim().min(1).nullable().optional().default(null),
});

const blockSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string().optional(), type: z.literal("paragrafo"), text: z.string().trim().min(1).max(4000) }),
  z.object({ id: z.string().optional(), type: z.literal("titulo"), text: z.string().trim().min(1).max(180) }),
  z.object({
    id: z.string().optional(),
    type: z.literal("imagem"),
    url: httpsOrNull,
    alt: z.string().trim().min(1).max(200),
    caption: z.string().trim().max(180).default(""),
  }),
  z.object({
    id: z.string().optional(),
    type: z.literal("citacao_lateral"),
    text: z.string().trim().min(1).max(400),
    side: z.enum(["esquerda", "direita"]),
  }),
  z.object({ id: z.string().optional(), type: z.literal("produto"), productId: z.string().trim().min(1) }),
]);

const postSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(160),
  excerpt: z.string().trim().max(240).default(""),
  category: z.string().trim().max(40).default(""),
  coverUrl: httpsOrNull,
  coverHex: z.union([hex, z.null()]).optional().default(null),
  authorId: z.string().trim().min(1).nullable().optional().default(null),
  influencerId: z.string().trim().min(1).nullable().optional().default(null),
  status: z.enum(["rascunho", "agendado", "publicado", "arquivado"]).default("rascunho"),
  publishedAt: z
    .union([z.string(), z.null(), z.literal("")])
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === null || value === "") return null;
      const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
      if (!match?.[1]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Data inválida." });
        return z.NEVER;
      }
      return match[1];
    }),
  readMinutes: z.number().int().positive().default(4),
  seoTitle: z.string().trim().max(160).default(""),
  seoDescription: z.string().trim().max(240).default(""),
  shareImageUrl: httpsOrNull,
  blocks: z.array(blockSchema).max(40).default([]),
});

async function changed(
  ctx: AdminRuntime,
  actor: Actor,
  action: string,
  entity: string,
  entityId: string,
  after: unknown,
  before?: unknown,
) {
  await writeAudit(ctx.sql, { actorId: actor.id, action, entity, entityId, before, after });
  await invalidateCatalogCache();
}

function lockedId(urlId: string, bodyId: string | undefined) {
  if (bodyId && bodyId !== urlId) throw new HttpError(409, "O identificador não muda.");
}

export function mountContent(admin: Hono, runtime: () => AdminRuntime): void {
  admin.get("/influencers", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "influencers");
    return c.json({ items: await listInfluencers(ctx.sql, true) });
  });
  admin.post("/influencers", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "influencers");
    const body = parseInput(influencerSchema, await readJson(c));
    if ((await listInfluencers(ctx.sql, true)).some((item) => item.slug === body.slug || item.id === body.slug)) {
      throw new HttpError(409, "Já existe um influencer com esse slug.");
    }
    const saved = await guard(() => saveInfluencer(ctx.sql, influencerInput(body)));
    await changed(ctx, actor, "influencer.save", "influencer", saved.slug, saved);
    return c.json({ item: saved }, 201);
  });
  admin.get("/influencers/:slug", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "influencers");
    const item = await influencerBy(ctx, c.req.param("slug"));
    if (!item) throw new HttpError(404, "Influencer não encontrado.");
    return c.json({ item });
  });
  admin.patch("/influencers/:slug", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "influencers");
    const current = await influencerBy(ctx, c.req.param("slug"));
    if (!current) throw new HttpError(404, "Influencer não encontrado.");
    const body = parseInput(influencerSchema, await readJson(c));
    if (body.slug !== current.slug) throw new HttpError(409, "O slug não muda.");
    const saved = await guard(() => saveInfluencer(ctx.sql, { ...influencerInput(body), id: current.id }));
    await changed(ctx, actor, "influencer.update", "influencer", saved.slug, saved, current);
    return c.json({ item: saved });
  });
  admin.delete("/influencers/:slug", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "influencers");
    const current = await influencerBy(ctx, c.req.param("slug"));
    if (!current) throw new HttpError(404, "Influencer não encontrado.");
    const saved = await guard(() => archiveInfluencer(ctx.sql, current.slug));
    await changed(ctx, actor, "influencer.archive", "influencer", saved.slug, saved, current);
    return c.json({ item: saved, archived: true });
  });

  admin.get("/authors", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "authors");
    return c.json({ items: await listAuthors(ctx.sql) });
  });
  admin.post("/authors", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "authors");
    const body = parseInput(authorSchema, await readJson(c));
    const id = body.id || randomUUID();
    if ((await listAuthors(ctx.sql)).some((item) => item.id === id)) throw new HttpError(409, "Já existe um autor com esse id.");
    const saved = await guard(() => saveAuthor(ctx.sql, { ...body, id }));
    await changed(ctx, actor, "author.save", "author", saved.id, saved);
    return c.json({ item: saved }, 201);
  });
  admin.get("/authors/:id", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "authors");
    const item = (await listAuthors(ctx.sql)).find((row) => row.id === c.req.param("id"));
    if (!item) throw new HttpError(404, "Autor não encontrado.");
    return c.json({ item });
  });
  admin.patch("/authors/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "authors");
    const id = c.req.param("id");
    const current = (await listAuthors(ctx.sql)).find((row) => row.id === id);
    if (!current) throw new HttpError(404, "Autor não encontrado.");
    const body = parseInput(authorSchema, await readJson(c));
    lockedId(id, body.id);
    const saved = await guard(() => saveAuthor(ctx.sql, { ...body, id }));
    await changed(ctx, actor, "author.update", "author", saved.id, saved, current);
    return c.json({ item: saved });
  });
  admin.delete("/authors/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "authors");
    const id = c.req.param("id");
    const current = (await listAuthors(ctx.sql)).find((row) => row.id === id);
    if (!current) throw new HttpError(404, "Autor não encontrado.");
    await guard(() => deleteAuthor(ctx.sql, id));
    await changed(ctx, actor, "author.delete", "author", id, { deleted: true }, current);
    return c.json({ ok: true });
  });

  admin.get("/posts", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "posts");
    return c.json({ items: await listPosts(ctx.sql, c.req.query("influencer") || undefined) });
  });
  admin.post("/posts", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "posts");
    const body = parseInput(postSchema, await readJson(c));
    if ((await listPosts(ctx.sql)).some((item) => item.slug === body.slug || item.id === body.slug)) {
      throw new HttpError(409, "Já existe um texto com esse slug.");
    }
    const name = await authorName(ctx, body.authorId);
    const saved = await guard(() => savePost(ctx.sql, postInput(body), name));
    await changed(ctx, actor, "post.save", "post", saved.slug, saved);
    return c.json({ item: saved }, 201);
  });
  admin.get("/posts/:slug", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "posts");
    const item = await postBy(ctx, c.req.param("slug"));
    if (!item) throw new HttpError(404, "Texto não encontrado.");
    return c.json({ item });
  });
  admin.patch("/posts/:slug", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "posts");
    const current = await postBy(ctx, c.req.param("slug"));
    if (!current) throw new HttpError(404, "Texto não encontrado.");
    const body = parseInput(postSchema, await readJson(c));
    if (body.slug !== current.slug) throw new HttpError(409, "O slug não muda.");
    const name = await authorName(ctx, body.authorId);
    const saved = await guard(() => savePost(ctx.sql, { ...postInput(body), id: current.id }, name));
    await changed(ctx, actor, "post.update", "post", saved.slug, saved, current);
    return c.json({ item: saved });
  });
  admin.delete("/posts/:slug", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "posts");
    const current = await postBy(ctx, c.req.param("slug"));
    if (!current) throw new HttpError(404, "Texto não encontrado.");
    const saved = await guard(() => archivePost(ctx.sql, current.slug));
    await changed(ctx, actor, "post.archive", "post", saved.slug, saved, current);
    return c.json({ item: saved, archived: true });
  });
}

function influencerInput(body: z.infer<typeof influencerSchema>) {
  return {
    ...body,
    id: body.slug,
    couponCode: body.couponCode ? body.couponCode.toUpperCase() : null,
    quotes: body.quotes.map((quote, index) => ({ id: quote.id || "", body: quote.body, position: quote.position ?? index })),
    images: body.images.map((image, index) => ({
      id: image.id || "",
      url: image.url ?? null,
      alt: image.alt,
      caption: image.caption,
      instagramPostUrl: image.instagramPostUrl ?? null,
      fallbackHex: image.fallbackHex,
      position: image.position ?? index,
    })),
  };
}

async function influencerBy(ctx: AdminRuntime, key: string) {
  return (await listInfluencers(ctx.sql, true)).find((item) => item.slug === key || item.id === key) ?? null;
}

async function authorName(ctx: AdminRuntime, authorId: string | null) {
  const authors = await listAuthors(ctx.sql);
  return authors.find((author) => author.id === authorId)?.name ?? "Redação PULSO";
}

function postInput(body: z.infer<typeof postSchema>) {
  return {
    ...body,
    id: body.slug,
    blocks: body.blocks.map((block) => ({ ...block, id: block.id || "" })),
  };
}

async function postBy(ctx: AdminRuntime, key: string) {
  return (await listPosts(ctx.sql)).find((item) => item.slug === key || item.id === key) ?? null;
}
