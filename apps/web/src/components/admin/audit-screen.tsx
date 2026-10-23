"use client";

import { Field, Notice } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch, AdminApiError } from "@/lib/admin-fetch";
import { useEffect, useState, type FormEvent } from "react";

interface AuditRow {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

interface AuditList {
  items: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface AuditFilters {
  actor: string;
  entity: string;
  entityId: string;
  from: string;
  to: string;
}

const EMPTY: AuditFilters = { actor: "", entity: "", entityId: "", from: "", to: "" };

function queryOf(filters: AuditFilters): string {
  const search = new URLSearchParams({ page: "1", pageSize: "50" });
  for (const [key, value] of Object.entries(filters)) {
    if (value.trim()) search.set(key, value.trim());
  }
  return search.toString();
}

function when(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}

export function AuditScreen() {
  const [draft, setDraft] = useState<AuditFilters>(EMPTY);
  const [applied, setApplied] = useState<AuditFilters>(EMPTY);
  const [items, setItems] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await adminFetch<AuditList>(`audit?${queryOf(applied)}`);
        if (cancelled) return;
        setItems(list.items);
        setTotal(list.total);
        setError(null);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof AdminApiError ? caught.message : "Não deu para ler a auditoria.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [applied]);

  function apply(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setApplied(draft);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">Dono</p>
      <h1 className="break-words font-display text-6xl leading-none">Auditoria</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">GET /v1/admin/audit. Só o dono. O filtro usa ator, entidade, id e o dia.</p>
      <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={apply}>
        <Field label="Ator"><Input aria-label="Ator" value={draft.actor} onChange={(event) => setDraft({ ...draft, actor: event.target.value })} /></Field>
        <Field label="Entidade"><Input aria-label="Entidade" value={draft.entity} onChange={(event) => setDraft({ ...draft, entity: event.target.value })} /></Field>
        <Field label="Id da entidade"><Input aria-label="Id da entidade" value={draft.entityId} onChange={(event) => setDraft({ ...draft, entityId: event.target.value })} /></Field>
        <Field label="De"><Input aria-label="De" type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></Field>
        <Field label="Até"><Input aria-label="Até" type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></Field>
        <div className="flex items-end"><Button type="submit" className="rounded-full">Filtrar</Button></div>
      </form>
      {error ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}
      {loading ? <p className="mt-4 text-sm text-muted-foreground">Carregando…</p> : null}
      <p className="mt-4 text-xs text-muted-foreground">{total} registro{total === 1 ? "" : "s"}</p>
      <div className="mt-2 overflow-auto rounded-[1.4rem] border border-white/10">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Quando</th>
              <th className="px-3 py-3">Ator</th>
              <th className="px-3 py-3">Ação</th>
              <th className="px-3 py-3">Entidade</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? <tr><td className="px-3 py-6 text-muted-foreground" colSpan={4}>Nada nesse filtro.</td></tr> : null}
            {items.map((item) => (
              <tr key={item.id} className="border-t border-white/10 align-top">
                <td className="px-3 py-3 whitespace-nowrap">{when(item.createdAt)}</td>
                <td className="px-3 py-3 break-all">{item.actorId ?? "—"}</td>
                <td className="px-3 py-3">{item.action}</td>
                <td className="px-3 py-3">
                  <p>{item.entity}{item.entityId ? ` · ${item.entityId}` : ""}</p>
                  {item.before || item.after ? (
                    <details className="mt-1 text-xs text-muted-foreground">
                      <summary>Antes e depois</summary>
                      <pre className="mt-2 max-w-xl overflow-auto whitespace-pre-wrap break-words">{JSON.stringify({ before: item.before, after: item.after }, null, 2)}</pre>
                    </details>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
