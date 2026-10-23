import { cookies } from "next/headers";
import type { AdminSessionView } from "@/lib/admin-types";
import { COOKIE_NAME, toPublicUser, usingDevSessionSecret, verifySession } from "@/server/admin-session";

export async function currentSession() {
  const jar = await cookies();
  return verifySession(jar.get(COOKIE_NAME)?.value);
}

export async function currentAdminView(): Promise<AdminSessionView | null> {
  const session = await currentSession();
  if (!session) return null;
  return { user: toPublicUser(session), source: session.src, devSecret: usingDevSessionSecret() };
}
