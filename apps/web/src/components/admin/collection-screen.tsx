"use client";

import { CheckRow, Field, Notice, TextArea } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch, AdminApiError } from "@/lib/admin-fetch";
import type { AdminList, AdminOne } from "@/lib/admin-types";
import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

export type FieldSpec<T> =
  | { kind: "text" | "textarea"; key: keyof T & string; label: string; hint?: string }
  | { kind: "number"; key: keyof T & string; label: string; hint?: string }
  | { kind: "check"; key: keyof T & string; label: string }
  | { kind: "select"; key: keyof T & string; label: string; options: { value: string; label: string }[]; nullable?: boolean };

export function CollectionScreen<T extends { id: string }>({
  eyebrow,
  title,
  description,
  resource,
  columns,
  blank,
  fields,
  renderEditor,
  newHref,
  editHref,
  removeLabel = "Apagar",
}: {
  eyebrow: string;
  title: string;
  description?: string;
  resource: string;
  columns: { header: string; cell: (item: T) => ReactNode }[];
  blank?: () => T;
  fields?: FieldSpec<T>[];
  renderEditor?: (draft: T, update: (patch: Partial<T>) => void) => ReactNode;
  newHref?: string;
  editHref?: (item: T) => string;
  removeLabel?: string;
}) {
  const [items, setItems] = useState<T[]>([]);
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [draft, setDraft] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await adminFetch<AdminList<T>>(`${resource}?q=${encodeURIComponent(applied)}&pageSize=100`);
        if (!cancelled) setItems(list.items);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof AdminApiError ? caught.message : "Não deu para listar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [applied, resource]);

  function update(patch: Partial<T>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  async function reload() {
    const list = await adminFetch<AdminList<T>>(`${resource}?q=${encodeURIComponent(applied)}&pageSize=100`);
    setItems(list.items);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setError(null);
    setNotice(null);
    const exists = Boolean(draft.id) && items.some((item) => item.id === draft.id);
    try {
      if (exists) await adminFetch<AdminOne<T>>(`${resource}/${draft.id}`, { method: "PATCH", body: JSON.stringify(draft) });
      else await adminFetch<AdminOne<T>>(resource, { method: "POST", body: JSON.stringify(draft) });
      setDraft(null);
      setNotice("Salvo.");
      await reload();
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "Não deu para salvar.");
    }
  }

  async function remove(item: T) {
    setError(null);
    try {
      await adminFetch(`${resource}/${item.id}`, { method: "DELETE" });
      setConfirmId(null);
      setNotice("Atualizado.");
      await reload();
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "Não deu para concluir.");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">{eyebrow}</p>
          <h2 className="font-display text-5xl leading-none">{title}</h2>
          {description ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {newHref ? (
          <Button asChild className="rounded-full"><Link href={newHref}>Novo</Link></Button>
        ) : blank ? (
          <Button type="button" className="rounded-full" onClick={() => { setDraft(blank()); setNotice(null); setError(null); }}>Novo</Button>
        ) : null}
      </div>
      <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); setApplied(query); }}>
        <Input aria-label={`Buscar ${title}`} placeholder="Buscar" value={query} onChange={(event) => setQuery(event.target.value)} className="max-w-xs" />
        <Button type="submit" variant="outline" className="rounded-full">Buscar</Button>
      </form>
      {error ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}
      {notice ? <div className="mt-3"><Notice tone="ok">{notice}</Notice></div> : null}
      {loading ? <p className="mt-4 text-sm text-muted-foreground">Carregando…</p> : null}
      <div className="mt-4 overflow-auto rounded-[1.4rem] border border-white/10">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              {columns.map((column) => <th key={column.header} className="px-3 py-3">{column.header}</th>)}
              <th className="px-3 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? <tr><td className="px-3 py-6 text-muted-foreground" colSpan={columns.length + 1}>Nada nesse filtro.</td></tr> : null}
            {items.map((item) => (
              <tr key={item.id} className="border-t border-white/10">
                {columns.map((column) => <td key={column.header} className="px-3 py-3">{column.cell(item)}</td>)}
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    {editHref ? <Button asChild size="sm" variant="outline"><Link href={editHref(item)}>Editar</Link></Button> : null}
                    {!editHref && (fields || renderEditor) ? (
                      <Button size="sm" variant="outline" type="button" onClick={() => { setDraft(item); setNotice(null); setError(null); }}>Editar</Button>
                    ) : null}
                    {removeLabel ? (
                      confirmId === item.id ? (
                        <Button size="sm" variant="outline" type="button" onClick={() => void remove(item)}>Confirmar</Button>
                      ) : (
                        <Button size="sm" variant="outline" type="button" onClick={() => setConfirmId(item.id)}>{removeLabel}</Button>
                      )
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {draft && (renderEditor || fields) ? (
        <form className="mt-4 rounded-[1.4rem] border border-white/10 p-4" onSubmit={(event) => void save(event)}>
          {renderEditor ? renderEditor(draft, update) : fields ? <SchemaForm draft={draft} update={update} fields={fields} /> : null}
          <div className="mt-4 flex gap-2">
            <Button type="submit" className="rounded-full">Salvar</Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setDraft(null)}>Cancelar</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function SchemaForm<T extends object>({ draft, update, fields }: { draft: T; update: (patch: Partial<T>) => void; fields: FieldSpec<T>[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {fields.map((field) => {
        const value = draft[field.key];
        if (field.kind === "check") {
          return (
            <div key={field.key} className="md:col-span-2">
              <CheckRow label={field.label} checked={value === true} onChange={(checked) => update({ [field.key]: checked } as Partial<T>)} />
            </div>
          );
        }
        if (field.kind === "textarea") {
          return (
            <div key={field.key} className="md:col-span-2">
              <TextArea label={field.label} value={value === null || value === undefined ? "" : String(value)} onChange={(next) => update({ [field.key]: next } as Partial<T>)} />
            </div>
          );
        }
        if (field.kind === "select") {
          const current = value === null || value === undefined ? "" : String(value);
          return (
            <Field key={field.key} label={field.label}>
              <select
                aria-label={field.label}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={current}
                onChange={(event) => {
                  const next = event.target.value;
                  update({ [field.key]: field.nullable && next === "" ? null : next } as Partial<T>);
                }}
              >
                {field.nullable ? <option value="">Nenhum</option> : null}
                {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
          );
        }
        return (
          <Field key={field.key} label={field.label} hint={field.hint}>
            <Input
              aria-label={field.label}
              type={field.kind === "number" ? "number" : "text"}
              value={value === null || value === undefined ? "" : String(value)}
              onChange={(event) => {
                const next = field.kind === "number" ? Number(event.target.value) : event.target.value;
                update({ [field.key]: next } as Partial<T>);
              }}
            />
          </Field>
        );
      })}
    </div>
  );
}
