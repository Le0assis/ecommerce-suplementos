"use client";

import { Field, Notice } from "@/components/admin/fields";
import { useAdminSession } from "@/components/admin/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch, AdminApiError } from "@/lib/admin-fetch";
import { canAccess, WAITLIST_DENIED, type AdminDrop, type AdminList, type AdminRole } from "@/lib/admin-types";
import { maskEmail } from "@/lib/mask-email";
import { useEffect, useState } from "react";

interface DropOption {
  id: string;
  edition: string;
  name: string;
}

interface WaitlistEntry {
  id: string;
  email: string;
  consentAt: string;
  consentOrigin: string;
  anonymizedAt: string | null;
  createdAt: string;
}

function explain(caught: unknown, missing = "Não encontrado."): string {
  if (!(caught instanceof AdminApiError)) return "Não deu para concluir.";
  if (caught.status === 403) return "Seu papel não faz isso.";
  if (caught.status === 404) return missing;
  return caught.message;
}

function canRemove(role: AdminRole): boolean {
  return role === "dono" || role === "atendimento";
}

function canAnonymize(role: AdminRole): boolean {
  return role === "dono" || role === "editor";
}

const NO_DROPS: DropOption[] = [];

export function WaitlistScreen({ publicDrops = NO_DROPS }: { publicDrops?: DropOption[] }) {
  const role = useAdminSession().user.role;
  const remove = canRemove(role);
  const anonymize = canAnonymize(role);
  const [drops, setDrops] = useState<DropOption[]>([]);
  const [dropId, setDropId] = useState("");
  const [items, setItems] = useState<WaitlistEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (role === "editor") {
        if (!cancelled) setLoading(false);
        return;
      }
      if (!canAccess(role, "drops")) {
        if (cancelled) return;
        setDrops(publicDrops);
        setDropId((current) => current || publicDrops[0]?.id || "");
        setLoading(false);
        return;
      }
      try {
        const list = await adminFetch<AdminList<AdminDrop>>("drops?pageSize=100");
        if (cancelled) return;
        const options = list.items.map((drop) => ({ id: drop.id, edition: drop.edition, name: drop.name }));
        const next = options.length ? options : publicDrops;
        setDrops(next);
        setDropId((current) => current || next[0]?.id || "");
      } catch (caught) {
        if (cancelled) return;
        if (publicDrops.length) {
          setDrops(publicDrops);
          setDropId((current) => current || publicDrops[0]?.id || "");
        } else {
          setError(explain(caught, "Drop não encontrado."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [publicDrops, role]);

  useEffect(() => {
    if (role === "editor" || !dropId) return;
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const list = await adminFetch<{ items: WaitlistEntry[]; total: number }>(`drops/${encodeURIComponent(dropId)}/waitlist`);
        if (!cancelled) setItems(list.items);
      } catch (caught) {
        if (!cancelled) {
          setItems([]);
          setError(explain(caught, "Drop não encontrado."));
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [dropId, role]);

  async function refresh() {
    if (!dropId) return;
    const list = await adminFetch<{ items: WaitlistEntry[] }>(`drops/${encodeURIComponent(dropId)}/waitlist`);
    setItems(list.items);
  }

  async function anonymizeEmail(email: string) {
    setError(null);
    setNotice(null);
    try {
      await adminFetch("drops/waitlist/anonymize", { method: "POST", body: JSON.stringify({ email }) });
      setNotice("E-mail anonimizado.");
      await refresh();
    } catch (caught) {
      setError(explain(caught));
    }
  }

  async function removeEntry(id: string) {
    setError(null);
    setNotice(null);
    try {
      await adminFetch(`drops/waitlist/${encodeURIComponent(id)}`, { method: "DELETE" });
      setConfirmId(null);
      setNotice("Inscrição removida.");
      await refresh();
    } catch (caught) {
      setConfirmId(null);
      setError(explain(caught, "Inscrição não encontrada."));
    }
  }

  if (role === "editor") {
    return (
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">LGPD</p>
        <h1 className="font-display text-6xl leading-none">Lista de espera</h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">{WAITLIST_DENIED}</p>
      </div>
    );
  }

  const shownEmail = (item: WaitlistEntry) => {
    if (item.anonymizedAt) return "Anonimizado";
    return role === "atendimento" ? maskEmail(item.email) : item.email;
  };

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">LGPD</p>
      <h1 className="font-display text-6xl leading-none">Lista de espera</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        O dono vê o e-mail inteiro. O atendimento vê a máscara, como j***@d***.com, e remove pelo id. O editor não abre a lista. Os e-mails ficam na API. Esta página não grava cópia.
      </p>
      <div className="mt-4 max-w-sm">
        <Field label="Drop">
          <select aria-label="Drop" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={dropId} onChange={(event) => { setDropId(event.target.value); setConfirmId(null); }}>
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
              {remove || anonymize ? <th className="px-3 py-3">Ações</th> : null}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? <tr><td className="px-3 py-6 text-muted-foreground" colSpan={remove || anonymize ? 3 : 2}>Ninguém nesta lista.</td></tr> : null}
            {items.map((item) => (
              <tr key={item.id} className="border-t border-white/10">
                <td className="px-3 py-3">{shownEmail(item)}</td>
                <td className="px-3 py-3">{item.consentOrigin}<br />{item.consentAt}</td>
                {remove || anonymize ? (
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      {anonymize ? <Button size="sm" variant="outline" type="button" disabled={Boolean(item.anonymizedAt)} onClick={() => void anonymizeEmail(item.email)}>Anonimizar</Button> : null}
                      {remove ? (
                        confirmId === item.id ? (
                          <Button size="sm" variant="outline" type="button" onClick={() => void removeEntry(item.id)}>Confirmar</Button>
                        ) : (
                          <Button size="sm" variant="outline" type="button" onClick={() => setConfirmId(item.id)}>Remover</Button>
                        )
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {remove ? (
        <ManualEmail
          onDone={(message) => { setNotice(message); setError(null); void refresh().catch((caught: unknown) => setError(explain(caught))); }}
          onFail={(message) => { setError(message); setNotice(null); }}
        />
      ) : null}
    </div>
  );
}

function ManualEmail({ onDone, onFail }: { onDone: (message: string) => void; onFail: (message: string) => void }) {
  const [email, setEmail] = useState("");
  const [confirm, setConfirm] = useState(false);
  return (
    <form
      className="mt-4 flex max-w-xl flex-col gap-2 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        if (!confirm) {
          setConfirm(true);
          return;
        }
        void adminFetch("drops/waitlist/erase", { method: "POST", body: JSON.stringify({ email }) })
          .then(() => {
            setConfirm(false);
            setEmail("");
            onDone("E-mail removido da lista.");
          })
          .catch((caught: unknown) => onFail(explain(caught, "Inscrição não encontrada.")));
      }}
    >
      <Input aria-label="E-mail para remover" type="email" required value={email} onChange={(event) => { setEmail(event.target.value); setConfirm(false); }} placeholder="email para remover" />
      <Button type="submit" variant="outline" className="rounded-full">{confirm ? "Confirmar remoção" : "Remover por e-mail"}</Button>
    </form>
  );
}
