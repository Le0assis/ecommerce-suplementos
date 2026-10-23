import { NextResponse } from "next/server";
import { loadAdminGate, readAdminToken } from "@/server/admin-current";
import { clearCookieHeaders, clientAddress, cookieSecure, loginOnApi, logoutOnApi, sessionCookieHeader } from "@/server/admin-session";

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

function withSessionCookies(response: NextResponse, request: Request, token: string, maxAge: number) {
  const secure = cookieSecure(request);
  if (maxAge > 0) response.headers.append("set-cookie", sessionCookieHeader(token, maxAge, secure));
  else for (const header of clearCookieHeaders(secure)) response.headers.append("set-cookie", header);
  return response;
}

export async function GET() {
  const gate = await loadAdminGate();
  if (gate.kind === "user") return NextResponse.json({ user: gate.user });
  if (gate.kind === "down") return NextResponse.json({ error: "A API de login não respondeu." }, { status: 503 });
  return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem recusada." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const remote = await loginOnApi(email, password, clientAddress(request));
  if (!remote.ok) {
    const headers = new Headers();
    if (remote.retryAfter) headers.set("retry-after", remote.retryAfter);
    return NextResponse.json({ error: remote.error }, { status: remote.status, headers });
  }
  const response = NextResponse.json({ user: remote.user });
  return withSessionCookies(response, request, remote.token, remote.maxAge);
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem recusada." }, { status: 403 });
  const token = await readAdminToken();
  if (token) await logoutOnApi(token);
  const response = NextResponse.json({ ok: true });
  return withSessionCookies(response, request, "", 0);
}
