import { joinDropWaitlist } from "@/server/drop-waitlist";
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

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem recusada." }, { status: 403 });
  const { id } = await context.params;
  let body: { email?: unknown; consent?: unknown } = {};
  try {
    body = (await request.json()) as { email?: unknown; consent?: unknown };
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const result = await joinDropWaitlist(id, body, new Date().toISOString());
  return NextResponse.json(result.body, { status: result.status, headers: { "cache-control": "no-store" } });
}
