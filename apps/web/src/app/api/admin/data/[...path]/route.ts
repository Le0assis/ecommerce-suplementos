import { NextResponse } from "next/server";
import { handleAdminData } from "@/server/admin-client";
import { currentActor } from "@/server/admin-current";

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const session = await currentActor();
  if (session === "down") return NextResponse.json({ error: "A API de login não respondeu." }, { status: 503 });
  if (!session) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 800_000) return NextResponse.json({ error: "Arquivo grande demais para o adaptador." }, { status: 413 });
  const { path } = await context.params;
  let body: unknown;
  if (request.method !== "GET" && request.method !== "DELETE") {
    const text = await request.text();
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
      }
    } else {
      body = {};
    }
  }
  const url = new URL(request.url);
  const result = await handleAdminData(session, request.method, path, url.searchParams, body);
  return NextResponse.json(result.body, { status: result.status, headers: { "cache-control": "no-store" } });
}

export function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return handle(request, context);
}

export function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return handle(request, context);
}

export function PATCH(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return handle(request, context);
}

export function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return handle(request, context);
}
