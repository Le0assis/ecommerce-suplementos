import { posts } from "@pulso/data";
import { NextResponse, type NextRequest } from "next/server";

const HIDDEN = new Set(["rascunho", "arquivado", "agendado"]);

function catalogHas(slug: string): boolean {
  return posts.some((post) => post.slug === slug);
}

async function isPublished(slug: string): Promise<boolean> {
  const base = (process.env.API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
  try {
    const response = await fetch(`${base}/v1/posts/${encodeURIComponent(slug)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(800),
    });
    if (response.status === 404) return false;
    if (!response.ok) return catalogHas(slug);
    const body = (await response.json()) as { post?: { status?: unknown } };
    const status = body.post?.status;
    if (typeof status === "string" && (HIDDEN.has(status) || status !== "publicado")) return false;
    return Boolean(body.post);
  } catch {
    return catalogHas(slug);
  }
}

function notFoundDocument(): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Texto · PULSO</title></head><body><main><p>404</p><h1>Essa página não treina aqui</h1><p>O link quebrou ou o drop já saiu do ar.</p><p><a href="/loja">Voltar pra loja</a></p></main></body></html>`;
}

function isFlight(request: NextRequest): boolean {
  if (request.headers.get("rsc") === "1") return true;
  if (request.headers.get("accept")?.includes("text/x-component")) return true;
  if (request.nextUrl.searchParams.has("_rsc")) return true;
  if (request.headers.has("next-router-state-tree")) return true;
  if (request.headers.has("next-router-prefetch")) return true;
  if (request.headers.has("next-router-segment-prefetch")) return true;
  return false;
}

export async function proxy(request: NextRequest) {
  if (isFlight(request)) return NextResponse.next();
  const slug = request.nextUrl.pathname.slice("/blog/".length);
  if (!slug || slug.includes("/")) return NextResponse.next();
  if (await isPublished(decodeURIComponent(slug))) return NextResponse.next();
  return new NextResponse(notFoundDocument(), {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export const config = {
  matcher: "/blog/:slug",
};
