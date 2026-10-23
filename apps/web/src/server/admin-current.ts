import { cookies } from "next/headers";
import type { AdminActor, AdminSessionView } from "@/lib/admin-types";
import { COOKIE_NAME, meOnApi } from "@/server/admin-session";

export async function readAdminToken(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(COOKIE_NAME)?.value;
  return value || null;
}

export type AdminGate = { kind: "user"; user: AdminSessionView["user"] } | { kind: "anon" } | { kind: "down" };

export async function loadAdminGate(): Promise<AdminGate> {
  const token = await readAdminToken();
  if (!token) return { kind: "anon" };
  const me = await meOnApi(token);
  if (!me.ok) return me.reason === "down" ? { kind: "down" } : { kind: "anon" };
  return { kind: "user", user: me.user };
}

export async function currentAdminView(): Promise<AdminSessionView | null> {
  const gate = await loadAdminGate();
  if (gate.kind !== "user") return null;
  return { user: gate.user };
}

export async function currentActor(): Promise<AdminActor | "down" | null> {
  const token = await readAdminToken();
  if (!token) return null;
  const me = await meOnApi(token);
  if (!me.ok) return me.reason === "down" ? "down" : null;
  return { ...me.user, token };
}
