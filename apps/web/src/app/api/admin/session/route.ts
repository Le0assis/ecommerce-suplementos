import { NextResponse } from "next/server";
import { loginAgainstApi } from "@/server/admin-client";
import { currentAdminView, currentSession } from "@/server/admin-current";
import { forwardedForApi } from "@/server/forwarded-for";
import { COOKIE_NAME, SESSION_SECONDS, signSession, toPublicUser, type SessionPayload } from "@/server/admin-session";

function cookieSecure(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto) return proto === "https";
  return new URL(request.url).protocol === "https:";
}

function writeCookie(response: NextResponse, request: Request, value: string, maxAge: number) {
  response.cookies.set({
    name: COOKIE_NAME,
    value,
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(request),
    path: "/",
    maxAge,
  });
}

function sameOrigin(request: Request): boolean {
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  if (!host) return false;
  if (!origin) return host === "localhost" || host.startsWith("localhost:") || host.startsWith("127.0.0.1");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function GET() {
  const view = await currentAdminView();
  if (!view) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  return NextResponse.json({ user: view.user, source: view.source, devSecret: view.devSecret });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem recusada." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email.includes("@") || !password) return NextResponse.json({ error: "Informe e-mail e senha." }, { status: 400 });

  const remote = await loginAgainstApi(email, password, forwardedForApi(request));
  if (!remote) {
    return NextResponse.json({ error: "A API de admin está fora do ar." }, { status: 503 });
  }
  if (!remote.ok) {
    const headers = new Headers();
    if (remote.retryAfter) headers.set("retry-after", remote.retryAfter);
    return NextResponse.json({ error: remote.error }, { status: remote.status, headers });
  }

  const payload: SessionPayload = {
    v: 1,
    sub: remote.user.id,
    email: remote.user.email,
    name: remote.user.name,
    role: remote.user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
    src: "api",
    apiToken: remote.token,
  };

  let signed: string;
  try {
    signed = signSession(payload);
  } catch {
    return NextResponse.json({ error: "Sessão do site sem segredo. Defina ADMIN_SESSION_SECRET." }, { status: 503 });
  }
  const response = NextResponse.json({ user: toPublicUser(payload), source: payload.src });
  writeCookie(response, request, signed, SESSION_SECONDS);
  return response;
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem recusada." }, { status: 403 });
  const session = await currentSession();
  if (session?.apiToken) {
    try {
      await fetch(`${(process.env.API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "")}/v1/admin/logout`, {
        method: "POST",
        headers: { authorization: `Bearer ${session.apiToken}` },
        signal: AbortSignal.timeout(800),
      });
    } catch {
      // A sessão deste site sai mesmo se a API estiver fora.
    }
  }
  const response = NextResponse.json({ ok: true });
  writeCookie(response, request, "", 0);
  return response;
}
