import { writeAudit } from "@pulso/db/audit";
import { getAdminCoupon, listAdminCoupons, removeAdminCoupon, saveAdminCoupon, type AdminCoupon } from "@pulso/db/catalog";
import type { Hono } from "hono";
import type { z } from "zod";
import { HttpError, pageQuery, parseInput, raiseCatalog, readJson, requireActor, type AdminRuntime } from "./http";
import { couponSchema } from "./schemas";

type CouponBody = z.infer<typeof couponSchema>;

function toStored(body: CouponBody, uses = 0): AdminCoupon {
  return {
    id: body.code.trim().toUpperCase(),
    code: body.code.trim().toUpperCase(),
    label: body.label,
    kind: body.kind,
    value: body.kind === "shipping" ? 0 : body.value,
    minCents: body.minCents,
    startsAt: body.startsAt ?? null,
    endsAt: body.endsAt ?? null,
    maxUses: body.maxUses ?? null,
    uses,
    influencerId: body.influencerId ?? null,
    active: body.active,
  };
}

export function mountCoupons(admin: Hono, runtime: () => AdminRuntime): void {
  admin.get("/coupons", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "coupons");
    const paging = pageQuery(c, 50);
    const result = await listAdminCoupons(ctx.sql, { ...paging, active: c.req.query("active") ?? "" });
    return c.json(result);
  });

  admin.post("/coupons", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "coupons");
    const body = toStored(parseInput(couponSchema, await readJson(c)));
    if (await getAdminCoupon(ctx.sql, body.code)) throw new HttpError(409, "Já existe um cupom com esse código.");
    try {
      const saved = await saveAdminCoupon(ctx.sql, body, false);
      await writeAudit(ctx.sql, { actorId: actor.id, action: "coupon.create", entity: "coupon", entityId: saved.code, after: saved });
      return c.json({ item: saved }, 201);
    } catch (error) {
      raiseCatalog(error);
    }
  });

  admin.get("/coupons/:code", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "coupons");
    const item = await getAdminCoupon(ctx.sql, c.req.param("code").toUpperCase());
    if (!item) throw new HttpError(404, "Cupom não encontrado.");
    return c.json({ item });
  });

  admin.patch("/coupons/:code", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "coupons");
    const code = c.req.param("code").toUpperCase();
    const current = await getAdminCoupon(ctx.sql, code);
    if (!current) throw new HttpError(404, "Cupom não encontrado.");
    const body = toStored(parseInput(couponSchema, await readJson(c)), current.uses);
    if (body.code !== current.code) throw new HttpError(400, "O código do cupom não muda. Crie outro.");
    try {
      const saved = await saveAdminCoupon(ctx.sql, { ...body, uses: current.uses }, true);
      await writeAudit(ctx.sql, {
        actorId: actor.id,
        action: "coupon.update",
        entity: "coupon",
        entityId: saved.code,
        before: current,
        after: saved,
      });
      return c.json({ item: saved });
    } catch (error) {
      raiseCatalog(error);
    }
  });

  admin.delete("/coupons/:code", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "coupons");
    const code = c.req.param("code").toUpperCase();
    const current = await getAdminCoupon(ctx.sql, code);
    if (!current) throw new HttpError(404, "Cupom não encontrado.");
    try {
      const result = await removeAdminCoupon(ctx.sql, code);
      await writeAudit(ctx.sql, {
        actorId: actor.id,
        action: result.deleted ? "coupon.delete" : "coupon.archive",
        entity: "coupon",
        entityId: code,
        before: current,
        after: result.coupon,
      });
      if (result.deleted) return c.json({ ok: true });
      return c.json({ item: result.coupon, archived: true });
    } catch (error) {
      raiseCatalog(error);
    }
  });
}
