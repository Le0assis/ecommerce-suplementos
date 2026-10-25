import { cookies } from "next/headers";
import type { AdminPublicUser, AdminSessionView } from "@/lib/admin-types";
import { COOKIE_NAME, usingDevSessionSecret, verifySession } from "@/server/admin-session";

export async function currentSession() {
  const jar = await cookies();
  return verifySession(jar.get(COOKIE_NAME)?.value);
}

async function liveUser(token: string): Promise<AdminPublicUser | null> {
  const base = (process.env.API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
  try {
    const response = await fetch(`${base}/v1/admin/me`, {
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(800),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { user?: AdminPublicUser };
    if (!body.user?.id || !body.user.role) return null;
    return body.user;
  } catch {
    return null;
  }
}

export async function currentAdminView(): Promise<AdminSessionView | null> {
  const session = await currentSession();
  if (!session?.apiToken) return null;
  const user = await liveUser(session.apiToken);
  if (!user) return null;
  return { user, source: "api", devSecret: usingDevSessionSecret() };
}
