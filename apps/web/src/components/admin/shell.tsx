"use client";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ADMIN_NAV, canAccess, resourceForAdminPath, ROLE_LABEL, type AdminSessionView } from "@/lib/admin-types";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const SessionContext = createContext<AdminSessionView | null>(null);

export function useAdminSession(): AdminSessionView {
  const value = useContext(SessionContext);
  if (!value) throw new Error("Fora do painel.");
  return value;
}

export function AdminShell({ session, children }: { session: AdminSessionView; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const items = ADMIN_NAV.filter((item) => canAccess(session.user.role, item.resource));
  const allowed = canAccess(session.user.role, resourceForAdminPath(pathname));

  useEffect(() => {
    function leave() {
      router.push("/admin/login");
      router.refresh();
    }
    window.addEventListener("pulso-admin-session-end", leave);
    return () => window.removeEventListener("pulso-admin-session-end", leave);
  }, [router]);

  async function logout() {
    setLeaving(true);
    await fetch("/api/admin/session", { method: "DELETE" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <SessionContext.Provider value={session}>
    <div className="min-h-screen bg-background md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b border-white/10 bg-card md:sticky md:top-0 md:flex md:h-screen md:flex-col md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4 md:block">
          <Link href="/admin" className="inline-flex"><Logo /></Link>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Painel</p>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-y-auto" aria-label="Seções do admin">
          {items.map((item) => {
            const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-3 py-2 text-sm whitespace-nowrap ${active ? "bg-lime font-semibold text-primary-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 md:px-6">
          <div>
            <p className="text-sm">{session.user.email}</p>
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{ROLE_LABEL[session.user.role]} · API</p>
          </div>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => void logout()} disabled={leaving}>
            Sair
          </Button>
        </header>
        {session.devSecret ? (
          <p className="border-b border-white/10 px-4 py-2 text-xs text-pink md:px-6">
            Defina `ADMIN_SESSION_SECRET` no servidor antes de publicar. O cookie está assinado com o segredo de desenvolvimento.
          </p>
        ) : null}
        <div className="px-4 py-6 md:px-6">
          {allowed ? children : <p className="text-sm text-muted-foreground">Seu papel não faz isso.</p>}
        </div>
      </div>
    </div>
    </SessionContext.Provider>
  );
}

export function AdminLoading() {
  return <p className="px-6 py-16 text-sm text-muted-foreground">Abrindo o painel…</p>;
}
