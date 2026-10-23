"use client";

import { Field, Notice } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch, AdminApiError } from "@/lib/admin-fetch";
import type { AdminDrop, AdminList } from "@/lib/admin-types";
import { useEffect, useState } from "react";

interface WaitlistEntry {
  id: string;
  email: string;
  consentAt: string;
  consentOrigin: string;
  anonymizedAt: string | null;
  createdAt: string;
}

export function WaitlistScreen() {
  const [drops, setDrops] = useState<AdminDrop[]>([]);
  const [dropId, setDropId] = useState("");
  const [items, setItems] = useState<WaitlistEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await adminFetch<AdminList<AdminDrop>>("drops?pageSize=100");
        if (cancelled) return;
        setDrops(list.items);
        setDropId((current) => current || list.items[0]?.id || "");
      } catch (caught) {
        if (!cancelled) setError(caught instanceof AdminApiError ? caught.message : "Não deu para listar os drops.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!dropId) return;
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const list = await adminFetch<{ items: WaitlistEntry[]; total: number }>(`drops/${encodeURIComponent(dropId)}/waitlist`);
        if (!cancelled) setItems(list.items);
      } catch (caught) {
        if (!cancelled) {
          setItems([]);
          setError(caught instanceof AdminApiError ? caught.message : "Não deu para abrir a lista.");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [dropId]);

  async function act(path: "erase" | "anonymize", email: string) {
    setError(null);
    setNotice(null);
    try {
      await adminFetch(`drops/waitlist/${path}`, { method: "POST", body: JSON.stringify({ email }) });
      setNotice(path === "erase" ? "Pedido de exclusão enviado." : "E-mail anonimizado.");
      const list = await adminFetch<{ items: WaitlistEntry[] }>(`drops/${encodeURIComponent(dropId)}/waitlist`);
      setItems(list.items);
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "Não deu para concluir.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">LGPD</p>
      <h1 className="font-display text-6xl leading-none">Lista de espera</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Só o dono vê esta tela. Os e-mails ficam na API. Esta página não grava cópia.</p>
      <div className="mt-4 max-w-sm">
        <Field label="Drop">
          <select aria-label="Drop" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={dropId} onChange={(event) => setDropId(event.target.value)}>
            {drops.length === 0 ? <option value="">Nenhum drop</option> : null}
            {drops.map((drop) => <option key={drop.id} value={drop.id}>{drop.edition} · {drop.name}</option>)}
          </select>
        </Field>
      </div>
      {error ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}
      {notice ? <div className="mt-3"><Notice tone="ok">{notice}</Notice></div> : null}
      {loading ? <p className="mt-4 text-sm text-muted-foreground">Carregando…</p> : null}
      <div className="mt-4 overflow-auto rounded-[1.4rem] border border-white/10">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="px-3 py-3">E-mail</th>
              <th className="px-3 py-3">Consentimento</th>
              <th className="px-3 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? <tr><td className="px-3 py-6 text-muted-foreground" colSpan={3}>Ninguém nesta lista.</td></tr> : null}
            {items.map((item) => (
              <tr key={item.id} className="border-t border-white/10">
                <td className="px-3 py-3">{item.anonymizedAt ? "Anonimizado" : item.email}</td>
                <td className="px-3 py-3">{item.consentOrigin}<br />{item.consentAt}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" type="button" disabled={Boolean(item.anonymizedAt)} onClick={() => void act("anonymize", item.email)}>Anonimizar</Button>
                    <Button size="sm" variant="outline" type="button" onClick={() => void act("erase", item.email)}>Excluir</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ManualEmail dropId={dropId} onDone={(message) => { setNotice(message); setError(null); }} onFail={(message) => { setError(message); setNotice(null); }} />
    </div>
  );
}

function ManualEmail({ dropId, onDone, onFail }: { dropId: string; onDone: (message: string) => void; onFail: (message: string) => void }) {
  const [email, setEmail] = useState("");
  return (
    <form
      className="mt-4 flex max-w-xl flex-col gap-2 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        if (!dropId) {
          onFail("Escolha um drop.");
          return;
        }
        void adminFetch("drops/waitlist/erase", { method: "POST", body: JSON.stringify({ email }) })
          .then(() => onDone("Pedido de exclusão enviado."))
          .catch((caught: unknown) => onFail(caught instanceof AdminApiError ? caught.message : "Não deu para concluir."));
      }}
    >
      <Input aria-label="E-mail para excluir" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email para excluir" />
      <Button type="submit" variant="outline" className="rounded-full">Excluir e-mail</Button>
    </form>
  );
}
