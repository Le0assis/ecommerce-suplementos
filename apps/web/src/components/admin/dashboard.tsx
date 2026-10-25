"use client";

import { Notice } from "@/components/admin/fields";
import { useAdminSession } from "@/components/admin/shell";
import { adminFetch, AdminApiError } from "@/lib/admin-fetch";
import { canAccess, type AdminList } from "@/lib/admin-types";
import Link from "next/link";
import { useEffect, useState } from "react";

export function AdminDashboard() {
  const session = useAdminSession();
  const [products, setProducts] = useState<number | null>(null);
  const [coupons, setCoupons] = useState<number | null>(null);
  const [orders, setOrders] = useState<number | null>(null);
  const [pendingReviews, setPendingReviews] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seeProducts = canAccess(session.user.role, "products");
  const seeCoupons = canAccess(session.user.role, "coupons");
  const seeOrders = canAccess(session.user.role, "orders");
  const seeReviews = canAccess(session.user.role, "reviews");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (seeProducts) {
          const list = await adminFetch<AdminList<unknown>>("products?pageSize=1&status=ativos");
          if (!cancelled) setProducts(list.total);
        }
        if (seeCoupons) {
          const list = await adminFetch<AdminList<unknown>>("coupons?pageSize=1");
          if (!cancelled) setCoupons(list.total);
        }
        if (seeOrders) {
          const list = await adminFetch<AdminList<unknown>>("orders?pageSize=1");
          if (!cancelled) setOrders(list.total);
        }
        if (seeReviews) {
          const list = await adminFetch<AdminList<unknown>>("reviews?status=pendente&pageSize=1");
          if (!cancelled) setPendingReviews(list.total);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof AdminApiError ? caught.message : "Não deu para ler o painel.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [seeProducts, seeCoupons, seeOrders, seeReviews]);

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">Operação</p>
      <h1 className="font-display text-6xl leading-none">Painel</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">Catálogo, conteúdo e operação. A barra ao lado mostra só o que o seu papel pode abrir.</p>
      {error ? <div className="mt-4"><Notice tone="error">{error}</Notice></div> : null}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {seeProducts ? <Card href="/admin/produtos" title="Produtos" value={products} hint="Fora os arquivados" /> : null}
        {seeCoupons ? <Card href="/admin/cupons" title="Cupons" value={coupons} hint="Apagar só se nunca foi usado" /> : null}
        {seeOrders ? <Card href="/admin/pedidos" title="Pedidos" value={orders} hint="Status e rastreio" /> : null}
        {seeReviews ? <Card href="/admin/avaliacoes" title="Na fila" value={pendingReviews} hint="Avaliações pendentes" /> : null}
      </div>
      {!seeProducts && !seeCoupons && !seeOrders && !seeReviews ? <p className="mt-6 text-sm text-muted-foreground">Seu papel ainda não tem um resumo nesta tela.</p> : null}
    </div>
  );
}

function Card({ href, title, value, hint }: { href: string; title: string; value: number | null; hint: string }) {
  return (
    <Link href={href} className="rounded-[1.4rem] border border-white/10 bg-card p-4 hover:border-lime/50">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
      <p className="font-display text-6xl leading-none">{value === null ? "—" : value}</p>
      <p className="mt-2 text-sm text-lime">{hint}</p>
    </Link>
  );
}
