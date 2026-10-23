import { writeAudit } from "@pulso/db/audit";
import { getPool } from "@pulso/db/pool";
import { fromPgPool, type SqlClient } from "@pulso/db/sql";
import { Hono } from "hono";
import { mountAuth } from "./auth-routes";
import { mountContent } from "./content-routes";
import { mountCoupons } from "./coupon-routes";
import { applyAdminCors, HttpError, parseInput, readJson, requireActor } from "./http";
import { mountOps } from "./ops-routes";
import { mountProducts } from "./product-routes";
import { uploadSchema } from "./schemas";
import { cookieSecureFromEnv, sessionSecret } from "./session";
import {
  altFromClientPayload,
  assertUploadPath,
  defaultHandleUpload,
  defaultSignUpload,
  isBlobEvent,
  pathnameFor,
  uploadConstraints,
  type BlobUploadHandler,
  type UploadSigner,
} from "./uploads";
import type { AdminRuntime } from "./http";

export interface AdminAppOptions {
  sql?: SqlClient;
  sessionSecret?: string;
  now?: () => Date;
  cookieSecure?: boolean;
  signUpload?: UploadSigner;
  handleUpload?: BlobUploadHandler;
}

export function mountAdmin(app: Hono, options: AdminAppOptions = {}): void {
  const cached: { sql: SqlClient | null } = { sql: null };
  const runtime = (): AdminRuntime => {
    const secret = sessionSecret(process.env, options.sessionSecret);
    if (!secret) throw new HttpError(503, "Sessão do admin sem segredo. Defina ADMIN_SESSION_SECRET.");
    let sql = options.sql ?? cached.sql;
    if (!sql) {
      if (!process.env.DATABASE_URL) throw new HttpError(503, "Banco indisponível.");
      sql = fromPgPool(getPool());
      cached.sql = sql;
    }
    return {
      sql,
      secret,
      now: options.now ?? (() => new Date()),
      cookieSecure: options.cookieSecure ?? cookieSecureFromEnv(),
    };
  };

  const admin = new Hono();
  admin.use("*", async (c, next) => {
    const early = applyAdminCors(c);
    if (early) return early;
    await next();
  });
  admin.onError((error, c) => {
    if (error instanceof HttpError) return c.json({ error: error.message }, error.status);
    console.error(error);
    return c.json({ error: "Erro interno." }, 500);
  });

  mountAuth(admin, runtime);
  mountProducts(admin, runtime);
  mountCoupons(admin, runtime);
  mountOps(admin, runtime);
  mountContent(admin, runtime);

  admin.post("/uploads", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "uploads");
    const body = await readJson(c);
    if (isBlobEvent(body)) {
      const handler = options.handleUpload ?? defaultHandleUpload;
      let alt = "";
      const result = await handler({
        body,
        request: c.req.raw,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          assertUploadPath(pathname);
          alt = altFromClientPayload(clientPayload);
          return uploadConstraints(alt, actor.id);
        },
        onUploadCompleted: async ({ blob }) => {
          await writeAudit(ctx.sql, {
            actorId: actor.id,
            action: "upload.complete",
            entity: "upload",
            entityId: blob.pathname,
            after: { url: blob.url, pathname: blob.pathname },
          });
        },
      });
      if (alt) {
        await writeAudit(ctx.sql, {
          actorId: actor.id,
          action: "upload.sign",
          entity: "upload",
          entityId: null,
          after: { alt, mode: "client" },
        });
      }
      return c.json(result);
    }
    const input = parseInput(uploadSchema, body);
    const pathname = pathnameFor(input.contentType);
    const constraints = uploadConstraints(input.alt, actor.id);
    const signer = options.signUpload ?? defaultSignUpload;
    const signed = await signer({
      pathname,
      alt: input.alt,
      contentType: input.contentType,
      maximumSizeInBytes: constraints.maximumSizeInBytes,
      allowedContentTypes: constraints.allowedContentTypes,
      userId: actor.id,
    });
    await writeAudit(ctx.sql, {
      actorId: actor.id,
      action: "upload.sign",
      entity: "upload",
      entityId: pathname,
      after: { alt: input.alt, pathname, contentType: input.contentType },
    });
    return c.json(signed);
  });

  app.route("/v1/admin", admin);
}
