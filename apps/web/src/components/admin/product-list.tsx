"use client";

import { Notice, StatusPill } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch, AdminApiError } from "@/lib/admin-fetch";
import type { AdminList, AdminOne, AdminProduct } from "@/lib/admin-types";
import { formatBRL } from "@pulso/domain";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function ProductList() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ativos");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminList<AdminProduct> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void adminFetch<AdminList<AdminProduct>>(`products?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}&page=${page}`)
        .then((list) => {
          if (!cancelled) {
            setData(list);
            setError(null);
          }
        })
        .catch((caught: unknown) => {
          if (!cancelled) setError(caught instanceof AdminApiError ? caught.message : "Não deu para listar.");
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, status, page]);

  async function duplicate(id: string) {
    setPendingId(id);
    try {
      const created = await adminFetch<AdminOne<AdminProduct>>(`products/${id}/duplicate`, { method: "POST" });
      router.push(`/admin/produtos/${created.item.id}`);
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "Não deu para duplicar.");
    } finally {
      setPendingId(null);
    }
  }

  async function patchStatus(product: AdminProduct, next: AdminProduct["status"]) {
    setPendingId(product.id);
    try {
      await adminFetch(`products/${product.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      setPage(1);
      setData(null);
      const list = await adminFetch<AdminList<AdminProduct>>(`products?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}&page=1`);
      setData(list);
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "Não deu para atualizar.");
    } finally {
      setPendingId(null);
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">Catálogo</p>
          <h1 className="font-display text-6xl leading-none">Produtos</h1>
        </div>
        <Button asChild className="rounded-full"><Link href="/admin/produtos/novo">Novo produto</Link></Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Input aria-label="Buscar produto" placeholder="Nome, slug ou SKU" value={q} onChange={(event) => { setPage(1); setQ(event.target.value); }} className="max-w-xs" />
        <select aria-label="Filtrar status" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="ativos">Em linha</option>
          <option value="todos">Todos</option>
          <option value="ativo">Ativos</option>
          <option value="oculto">Ocultos</option>
          <option value="rascunho">Rascunhos</option>
          <option value="arquivado">Arquivados</option>
        </select>
      </div>
      {error ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}
      <div className="mt-4 overflow-auto rounded-[1.4rem] border border-white/10">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Produto</th>
              <th>Status</th>
              <th>Preço</th>
              <th>Estoque</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.length === 0 ? <tr><td className="px-3 py-6 text-muted-foreground" colSpan={5}>Nenhum produto nesse filtro.</td></tr> : null}
            {data?.items.map((product) => {
              const price = product.variants.length ? Math.min(...product.variants.map((variant) => variant.priceCents)) : null;
              const stock = product.flavors.reduce((sum, flavor) => sum + flavor.stock, 0);
              return (
                <tr key={product.id} className="border-t border-white/10">
                  <td className="px-3 py-3">
                    <p className="font-display text-2xl leading-none">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.line} · {product.slug}</p>
                  </td>
                  <td><StatusPill status={product.status} /></td>
                  <td>{price === null ? "—" : formatBRL(price)}</td>
                  <td>{stock}</td>
                  <td>
                    <div className="flex flex-wrap gap-2 py-2">
                      <Button asChild size="sm" variant="outline"><Link href={`/admin/produtos/${product.id}`}>Editar</Link></Button>
                      <Button size="sm" variant="outline" type="button" disabled={pendingId === product.id} onClick={() => void duplicate(product.id)}>Duplicar</Button>
                      {product.status !== "arquivado" ? (
                        <Button size="sm" variant="outline" type="button" disabled={pendingId === product.id} onClick={() => void patchStatus(product, product.status === "oculto" ? "ativo" : "oculto")}>
                          {product.status === "oculto" ? "Ativar" : "Ocultar"}
                        </Button>
                      ) : null}
                      {product.status !== "arquivado" ? (
                        <Button size="sm" variant="outline" type="button" disabled={pendingId === product.id} onClick={() => void patchStatus(product, "arquivado")}>Arquivar</Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm">
        <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</Button>
        <span className="text-muted-foreground">{page} / {pages}</span>
        <Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>Próxima</Button>
      </div>
    </div>
  );
}
