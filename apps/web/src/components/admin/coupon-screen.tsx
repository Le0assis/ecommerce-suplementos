"use client";

import { CheckRow, Field, MoneyField, Notice, SelectField } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch, AdminApiError } from "@/lib/admin-fetch";
import { blankCoupon, type AdminCoupon, type AdminInfluencerRef, type AdminList, type AdminOne } from "@/lib/admin-types";
import { useEffect, useState } from "react";

export function CouponScreen() {
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [influencers, setInfluencers] = useState<AdminInfluencerRef[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<AdminCoupon | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload(q = query) {
    const list = await adminFetch<AdminList<AdminCoupon>>(`coupons?q=${encodeURIComponent(q)}&pageSize=100`);
    setCoupons(list.items);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [list, people] = await Promise.all([
          adminFetch<AdminList<AdminCoupon>>("coupons?pageSize=100"),
          adminFetch<AdminList<AdminInfluencerRef>>("influencers"),
        ]);
        if (cancelled) return;
        setCoupons(list.items);
        setInfluencers(people.items);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof AdminApiError ? caught.message : "Não deu para listar os cupons.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (!draft) return;
    setError(null);
    setNotice(null);
    try {
      const code = draft.code.trim().toUpperCase();
      if (code && coupons.some((coupon) => coupon.code.toUpperCase() === code || coupon.id.toUpperCase() === code)) {
        await adminFetch<AdminOne<AdminCoupon>>(`coupons/${encodeURIComponent(code)}`, { method: "PATCH", body: JSON.stringify({ ...draft, code }) });
        setNotice("Cupom atualizado.");
      } else {
        await adminFetch<AdminOne<AdminCoupon>>("coupons", { method: "POST", body: JSON.stringify(draft) });
        setNotice("Cupom criado.");
      }
      setDraft(null);
      await reload();
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "Não deu para salvar o cupom.");
    }
  }

  async function remove(coupon: AdminCoupon) {
    setError(null);
    try {
      await adminFetch(`coupons/${encodeURIComponent(coupon.code || coupon.id)}`, { method: "DELETE" });
      setConfirmId(null);
      setNotice(`${coupon.code} apagado.`);
      await reload();
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "Não deu para apagar.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">Comercial</p>
          <h1 className="font-display text-6xl leading-none">Cupons</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">Percentual de 1 a 30, ou frete. Cupom e kit não somam: a loja usa o maior. Apagar só existe se o uso for zero.</p>
        </div>
        <Button type="button" className="rounded-full" onClick={() => { setDraft(blankCoupon()); setNotice(null); }}>Novo cupom</Button>
      </div>
      <div className="mt-4"><Input aria-label="Buscar cupom" placeholder="Código ou nome" value={query} onChange={(event) => { setQuery(event.target.value); void reload(event.target.value).catch(() => setError("Não deu para filtrar.")); }} className="max-w-xs" /></div>
      {error ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}
      {notice ? <div className="mt-3"><Notice tone="ok">{notice}</Notice></div> : null}
      {draft ? (
        <div className="mt-4 grid gap-3 rounded-[1.4rem] border border-white/10 bg-card p-4 md:grid-cols-3">
          <Field label="Código"><Input aria-label="Código do cupom" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} /></Field>
          <Field label="Nome"><Input aria-label="Nome do cupom" value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></Field>
          <SelectField label="Tipo" value={draft.kind} onChange={(kind) => setDraft({ ...draft, kind: kind as AdminCoupon["kind"], value: kind === "shipping" ? 0 : draft.value || 10 })}>
            <option value="percent">Percentual</option>
            <option value="shipping">Frete</option>
          </SelectField>
          {draft.kind === "percent" ? <Field label="Valor (%)"><Input aria-label="Percentual do cupom" inputMode="numeric" value={String(draft.value)} onChange={(event) => setDraft({ ...draft, value: Number(event.target.value) || 0 })} /></Field> : null}
          <MoneyField key={`${draft.id}-min-${draft.minCents}`} label="Mínimo do pedido" cents={draft.minCents} onChange={(minCents) => setDraft({ ...draft, minCents })} />
          <Field label="Começa"><Input aria-label="Início do cupom" type="datetime-local" value={toLocal(draft.startsAt)} onChange={(event) => setDraft({ ...draft, startsAt: fromLocal(event.target.value) })} /></Field>
          <Field label="Termina"><Input aria-label="Fim do cupom" type="datetime-local" value={toLocal(draft.endsAt)} onChange={(event) => setDraft({ ...draft, endsAt: fromLocal(event.target.value) })} /></Field>
          <Field label="Limite de uso" hint="Vazio significa sem limite."><Input aria-label="Limite de uso" inputMode="numeric" value={draft.maxUses ?? ""} onChange={(event) => setDraft({ ...draft, maxUses: event.target.value ? Number(event.target.value) : null })} /></Field>
          <SelectField label="Influencer dono" value={draft.influencerId ?? ""} onChange={(value) => setDraft({ ...draft, influencerId: value || null })}>
            <option value="">Nenhum</option>
            {influencers.map((influencer) => <option key={influencer.id} value={influencer.id}>{influencer.name}</option>)}
          </SelectField>
          <div className="flex items-end"><CheckRow label="Ativo" checked={draft.active} onChange={(active) => setDraft({ ...draft, active })} /></div>
          <div className="flex items-end"><CheckRow label="Anunciar na loja" checked={draft.public} onChange={(advertised) => setDraft({ ...draft, public: advertised })} /></div>
          <p className="text-sm text-muted-foreground md:col-span-3">Usos registrados: {draft.uses}. Esse número não se edita aqui. Anunciar mostra o código em GET /v1/coupons. Sem isso, só quem digita o código usa.</p>
          <div className="flex gap-2 md:col-span-3">
            <Button type="button" onClick={() => void save()}>Salvar cupom</Button>
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>Cancelar</Button>
          </div>
        </div>
      ) : null}
      <ul className="mt-4 divide-y divide-white/10 rounded-[1.4rem] border border-white/10">
        {loading ? <li className="p-4 text-sm text-muted-foreground">Carregando cupons…</li> : null}
        {!loading && coupons.length === 0 ? <li className="p-4 text-sm text-muted-foreground">Nenhum cupom.</li> : null}
        {coupons.map((coupon) => (
          <li key={coupon.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-display text-3xl leading-none">{coupon.code}</p>
              <p className="text-sm text-muted-foreground">
                {coupon.label} · {coupon.kind === "shipping" ? "frete" : `${coupon.value}%`} · {coupon.uses} uso{coupon.uses === 1 ? "" : "s"} · {coupon.active ? "ativo" : "inativo"} · {coupon.public ? "anunciado" : "interno"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setDraft(coupon)}>Editar</Button>
              {coupon.uses > 0 ? (
                <Button type="button" size="sm" variant="outline" onClick={() => setDraft({ ...coupon, active: false })}>Desativar</Button>
              ) : confirmId === coupon.id ? (
                <Button type="button" size="sm" variant="destructive" onClick={() => void remove(coupon)}>Confirmar</Button>
              ) : (
                <Button type="button" size="sm" variant="outline" onClick={() => setConfirmId(coupon.id)}>Apagar</Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function toLocal(value: string | null): string {
  return value ? value.slice(0, 16) : "";
}

function fromLocal(value: string): string | null {
  if (!value) return null;
  return value.length === 16 ? `${value}:00-03:00` : value;
}
