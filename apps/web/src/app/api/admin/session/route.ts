import { NextResponse } from "next/server";
import { loginAgainstApi } from "@/server/admin-client";
import { currentSession } from "@/server/admin-current";
import {
  adapterPasswordOk,
  clearFailures,
  COOKIE_NAME,
  peekBlocked,
  registerFailure,
  SESSION_SECONDS,
  signSession,
  toPublicUser,
  usingDevSessionSecret,
  type SessionPayload,
} from "@/server/admin-session";

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

function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function GET() {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  return NextResponse.json({ user: toPublicUser(session), source: session.src, devSecret: usingDevSessionSecret() });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem recusada." }, { status: 403 });
  const key = clientKey(request);
  const blocked = peekBlocked(key);
  if (blocked.blocked) {
    return NextResponse.json(
      { error: "Muitas tentativas. Espere um pouco e tente de novo." },
      { status: 429, headers: { "retry-after": String(blocked.retryAfter) } },
    );
  }
  const body = (await request.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  const email = typeof body?.email === "string" && body.email.includes("@") ? body.email.trim().toLowerCase() : "dono@pulso.local";
  if (!password) return NextResponse.json({ error: "Informe a senha." }, { status: 400 });

  const remote = await loginAgainstApi(email, password);
  if (remote && !remote.ok) {
    if (remote.status === 401 || remote.status === 403) registerFailure(key);
    return NextResponse.json({ error: remote.error }, { status: remote.status });
  }

  let payload: SessionPayload;
  if (remote?.ok) {
    payload = {
      v: 1,
      sub: remote.user.id,
      email: remote.user.email,
      name: remote.user.name,
      role: remote.user.role,
      exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
      src: "api",
      apiToken: remote.token,
    };
  } else {
    const checked = adapterPasswordOk(password);
    if (!checked.ok) {
      if (checked.status === 401) registerFailure(key);
      return NextResponse.json({ error: checked.error }, { status: checked.status });
    }
    payload = {
      v: 1,
      sub: "dono-local",
      email,
      name: "Dono",
      role: "dono",
      exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
      src: "adapter",
    };
  }

  clearFailures(key);
  const response = NextResponse.json({ user: toPublicUser(payload), source: payload.src });
  writeCookie(response, request, signSession(payload), SESSION_SECONDS);
  return response;
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem recusada." }, { status: 403 });
  const session = await currentSession();
  if (session?.src === "api" && session.apiToken) {
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
