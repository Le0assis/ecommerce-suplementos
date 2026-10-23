import { writeAudit } from "@pulso/db/audit";
import {
  anonymizeWaitlist,
  archiveDrop,
  dropState,
  eraseWaitlist,
  getDrop,
  getPublicDrop,
  joinWaitlist,
  listDrops,
  listPublicDrops,
  listWaitlist,
  saveDrop,
  type AdminDrop,
  type DropStatus,
  type PublicDrop,
} from "@pulso/db/drops";
import type { Sql } from "@pulso/db/sql";
import { products, upcomingDrop } from "@pulso/data";
import type { Hono } from "hono";
import { z } from "zod";
import { guard, HttpError, pageQuery, parseInput, readJson, requireActor, type AdminRuntime } from "./http";

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

const httpsUrl = z
  .union([
    z.string().url().refine((value) => value.startsWith("https://"), "A imagem precisa ser https."),
    z.literal(""),
    z.null(),
  ])
  .optional()
  .transform((value) => (value ? value : null));

const wholeOrNull = z.union([z.number().int().nonnegative().max(2_000_000_000), z.null()]).optional().default(null);

const dropSchema = z
  .object({
    id: z.string().trim().max(80).optional().default(""),
    edition: z.string().trim().min(1, "O drop precisa de edição.").max(80),
    name: z.string().trim().max(120).optional().default(""),
    productId: z.union([z.string().trim().min(1), z.null()]).optional().default(null),
    flavorId: z.union([z.string().trim().min(1), z.null()]).optional().default(null),
    startsAt: nullableDate,
    endsAt: nullableDate,
    unitsTotal: wholeOrNull,
    unitsLeft: wholeOrNull,
    teaser: z.string().trim().max(280).optional().default(""),
    heroImageUrl: httpsUrl,
    story: z.string().trim().max(800).optional().default(""),
    status: z.enum(["em_breve", "no_ar", "encerrado"]).optional().default("em_breve"),
  })
  .superRefine((drop, ctx) => {
    if (drop.startsAt && drop.endsAt && new Date(drop.endsAt).getTime() < new Date(drop.startsAt).getTime()) {
      ctx.addIssue({ code: "custom", message: "O fim não pode ser antes do começo.", path: ["endsAt"] });
    }
    if (!drop.flavorId && drop.unitsTotal !== null && drop.unitsLeft !== null && drop.unitsLeft > drop.unitsTotal) {
      ctx.addIssue({ code: "custom", message: "O que resta não pode passar do lote.", path: ["unitsLeft"] });
    }
  });

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(320)
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "E-mail inválido.");

const joinSchema = z.object({
  email: emailField,
  consent: z.boolean().refine((value) => value, "O consentimento precisa ser explícito."),
  consentOrigin: z.string().trim().min(1).max(80).optional().default("pagina_drops:v1"),
});

const emailSchema = z.object({
  email: emailField,
});

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function toInput(id: string, body: z.output<typeof dropSchema>): AdminDrop {
  return {
    id,
    edition: body.edition,
    name: body.name,
    productId: body.productId,
    flavorId: body.flavorId,
    startsAt: body.startsAt ?? null,
    endsAt: body.endsAt ?? null,
    unitsTotal: body.unitsTotal,
    unitsLeft: body.unitsLeft,
    teaser: body.teaser,
    heroImageUrl: body.heroImageUrl ?? null,
    story: body.story,
    status: body.status,
  };
}

export function mockPublicDrops(now: Date): PublicDrop[] {
  const live = products.flatMap((product) => {
    if (!product.drop) return [];
    const flavor = product.flavors.find((item) => product.drop?.id.endsWith(`-${item.id}`));
    const status: DropStatus = product.drop.teaser ? "em_breve" : "no_ar";
    const item: PublicDrop = {
      id: product.drop.id,
      edition: product.drop.edition,
      name: flavor?.name ?? product.name,
      productId: product.id,
      flavorId: flavor?.id ?? null,
      startsAt: null,
      endsAt: product.drop.endsAt,
      unitsTotal: null,
      unitsLeft: product.drop.unitsLeft,
      teaser: "",
      heroImageUrl: null,
      story: flavor?.tagline ?? "",
      status,
      state: "no_ar",
    };
    item.state = dropState(item, now);
    return [item];
  });
  const teaser: PublicDrop = {
    id: upcomingDrop.id,
    edition: upcomingDrop.edition,
    name: upcomingDrop.name,
    productId: null,
    flavorId: null,
    startsAt: null,
    endsAt: upcomingDrop.endsAt,
    unitsTotal: null,
    unitsLeft: null,
    teaser: upcomingDrop.note,
    heroImageUrl: null,
    story: "",
    status: "em_breve",
    state: "em_breve",
  };
  teaser.state = dropState(teaser, now);
  return [...live, teaser];
}

export function mountDrops(admin: Hono, runtime: () => AdminRuntime): void {
  admin.get("/drops", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "drops");
    const paging = pageQuery(c, 100);
    const status = c.req.query("status") ?? "";
    const result = await listDrops(ctx.sql, { ...paging, status });
    return c.json(result);
  });

  admin.post("/drops", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "drops");
    const body = parseInput(dropSchema, await readJson(c));
    const id = slugify(body.id) || slugify(body.edition);
    if (!id) throw new HttpError(400, "O drop precisa de edição.");
    const saved = await guard(() => saveDrop(ctx.sql, toInput(id, body), "insert"));
    await writeAudit(ctx.sql, { actorId: actor.id, action: "drop.save", entity: "drop", entityId: saved.id, after: saved });
    return c.json({ item: saved }, 201);
  });

  admin.get("/drops/:id/waitlist", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "drops");
    const items = await guard(() => listWaitlist(ctx.sql, c.req.param("id")));
    return c.json({ items, total: items.length });
  });

  admin.get("/drops/:id", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "drops");
    const item = await getDrop(ctx.sql, c.req.param("id"));
    if (!item) throw new HttpError(404, "Drop não encontrado.");
    return c.json({ item });
  });

  admin.patch("/drops/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "drops");
    const body = parseInput(dropSchema, await readJson(c));
    const before = await getDrop(ctx.sql, c.req.param("id"));
    const saved = await guard(() => saveDrop(ctx.sql, toInput(c.req.param("id"), body), "update"));
    await writeAudit(ctx.sql, { actorId: actor.id, action: "drop.save", entity: "drop", entityId: saved.id, before, after: saved });
    return c.json({ item: saved });
  });

  admin.delete("/drops/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "drops");
    const before = await getDrop(ctx.sql, c.req.param("id"));
    const saved = await guard(() => archiveDrop(ctx.sql, c.req.param("id")));
    await writeAudit(ctx.sql, {
      actorId: actor.id,
      action: "drop.archive",
      entity: "drop",
      entityId: saved.id,
      before,
      after: saved,
    });
    return c.json({ item: saved, archived: true });
  });

  admin.post("/drops/waitlist/anonymize", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "drops");
    const body = parseInput(emailSchema, await readJson(c));
    const removed = await guard(() => anonymizeWaitlist(ctx.sql, body.email));
    await writeAudit(ctx.sql, {
      actorId: actor.id,
      action: "waitlist.anonymize",
      entity: "drop_waitlist",
      entityId: null,
      after: { removed },
    });
    return c.json({ ok: true, removed });
  });

  admin.post("/drops/waitlist/erase", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "drops");
    const body = parseInput(emailSchema, await readJson(c));
    const removed = await guard(() => eraseWaitlist(ctx.sql, body.email));
    await writeAudit(ctx.sql, {
      actorId: actor.id,
      action: "waitlist.erase",
      entity: "drop_waitlist",
      entityId: null,
      after: { removed },
    });
    return c.json({ ok: true, removed });
  });
}

export function mountPublicDrops(app: Hono, resolveSql: () => Sql | null, now: () => Date): void {
  app.get("/v1/drops", async (c) => {
    const sql = resolveSql();
    const clock = now();
    if (!sql) return c.json({ drops: mockPublicDrops(clock), source: "mock" });
    return c.json({ drops: await listPublicDrops(sql, clock), source: "postgres" });
  });

  app.get("/v1/drops/:id", async (c) => {
    const sql = resolveSql();
    const clock = now();
    const id = c.req.param("id");
    if (!sql) {
      const drop = mockPublicDrops(clock).find((item) => item.id === id);
      if (!drop) return c.json({ error: "Drop não encontrado." }, 404);
      return c.json({ drop, source: "mock" });
    }
    const drop = await getPublicDrop(sql, id, clock);
    if (!drop) return c.json({ error: "Drop não encontrado." }, 404);
    return c.json({ drop, source: "postgres" });
  });

  app.post("/v1/drops/waitlist/erase", async (c) => {
    await c.req.json().catch(() => null);
    return c.json({ ok: true });
  });

  app.post("/v1/drops/:id/waitlist", async (c) => {
    const sql = resolveSql();
    if (!sql) return c.json({ error: "A lista de espera ainda não está no banco." }, 503);
    const body = parseInput(joinSchema, await readJson(c));
    const result = await guard(() =>
      joinWaitlist(sql, {
        dropId: c.req.param("id"),
        email: body.email,
        consentOrigin: body.consentOrigin,
        consentAt: now().toISOString(),
      }),
    );
    return c.json({ ok: true, already: result.already }, result.already ? 200 : 201);
  });
}
