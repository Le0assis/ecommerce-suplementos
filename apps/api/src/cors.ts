import type { Context } from "hono";

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function corsAllowlist(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    [env.CORS_ORIGINS, env.NEXT_PUBLIC_SITE_URL, env.ADMIN_CORS_ORIGIN]
      .flatMap((value) => (value ? value.split(",") : []))
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

/** Origem fora da lista não recebe Access-Control-Allow-Origin. Em produção a lista vazia também recusa. */
export function applyPublicCors(c: Context, env: NodeJS.ProcessEnv = process.env): Response | null {
  const origin = c.req.header("origin");
  if (!origin) return null;
  const allowed = corsAllowlist(env);
  const devLocal = env.NODE_ENV !== "production" && LOCAL_ORIGIN.test(origin);
  if (!allowed.has(origin) && !devLocal) return c.json({ error: "Origem não permitida." }, 403);
  c.header("access-control-allow-origin", origin);
  c.header("vary", "Origin");
  c.header("access-control-allow-headers", "content-type, authorization");
  c.header("access-control-allow-methods", "GET, POST, OPTIONS");
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  return null;
}
