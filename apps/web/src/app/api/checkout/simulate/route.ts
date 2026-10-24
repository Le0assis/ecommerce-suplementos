import { forwardCheckoutSimulate } from "@/server/checkout-quote";
import { NextResponse } from "next/server";

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

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem recusada." }, { status: 403 });
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const result = await forwardCheckoutSimulate(body);
  return NextResponse.json(result.body, { status: result.status, headers: { "cache-control": "no-store" } });
}
