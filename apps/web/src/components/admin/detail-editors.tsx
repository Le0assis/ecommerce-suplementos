"use client";

import { BlockEditor } from "@/components/admin/block-editor";
import { CheckRow, Field, ImageUrlField, Notice, Section, SelectField, TextArea } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch, AdminApiError } from "@/lib/admin-fetch";
import { omitEmptyIds, uniqueSlug } from "@/lib/admin-payload";
import type { AdminAuthor, AdminCoupon, AdminInfluencer, AdminList, AdminOne, AdminOrder, AdminPost, AdminProduct } from "@/lib/admin-types";
import { ORDER_STATUSES, POST_STATUSES, slugify } from "@/lib/admin-types";
import { blockProblem, readyBlocks } from "@/lib/post-blocks";
import { formatBRL } from "@pulso/domain";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

function blankInfluencer(): AdminInfluencer {
  return {
    id: "",
    slug: "",
    name: "",
    handle: "@",
    instagramUrl: null,
    city: "",
    sport: "",
    bio: "",
    story: "",
    followers: "",
    accent: "#d6ff3c",
    discountPercent: 10,
    active: true,
    couponCode: null,
    productIds: [],
    quotes: [],
    images: [],
  };
}

function blankPost(): AdminPost {
  return {
    id: "",
    slug: "",
    title: "",
    excerpt: "",
    category: "Suplemento",
    coverUrl: null,
    coverHex: "#d6ff3c",
    authorId: null,
    influencerId: null,
    status: "rascunho",
    publishedAt: null,
    readMinutes: 4,
    seoTitle: "",
    seoDescription: "",
    shareImageUrl: null,
    blocks: [],
  };
}

function localValue(iso: string | null): string {
  return iso ? iso.slice(0, 16) : "";
}

function fromLocal(value: string): string | null {
  if (!value) return null;
  return value.length === 16 ? `${value}:00-03:00` : value;
}

function publishedDay(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? null;
}

export function InfluencerEditor({ influencerId }: { influencerId: string }) {
  const isNew = influencerId === "novo";
  const router = useRouter();
  const [person, setPerson] = useState<AdminInfluencer | null>(isNew ? blankInfluencer() : null);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [knownSlugs, setKnownSlugs] = useState<string[]>([]);
  const [slugEdited, setSlugEdited] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [productList, couponList, people] = await Promise.all([
          adminFetch<AdminList<AdminProduct>>("products?status=todos&pageSize=100"),
          adminFetch<AdminList<AdminCoupon>>("coupons?pageSize=100"),
          adminFetch<AdminList<AdminInfluencer>>("influencers?pageSize=100"),
        ]);
        if (cancelled) return;
        setProducts(productList.items);
        setCoupons(couponList.items);
        setKnownSlugs(people.items.map((item) => item.slug));
        if (!isNew) {
          const found = people.items.find((item) => item.id === influencerId || item.slug === influencerId);
          if (!found) {
            setError("A API não tem GET /v1/admin/influencers/:id. Esse influencer não está na lista.");
            return;
          }
          setPerson(found);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof AdminApiError ? caught.message : "Não deu para abrir o influencer.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [influencerId, isNew]);

  function update(patch: Partial<AdminInfluencer>) {
    setPerson((current) => (current ? { ...current, ...patch } : current));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!person) return;
    const slug = isNew || !person.id ? uniqueSlug(person.slug || person.name, knownSlugs) : slugify(person.slug || person.name);
    const payload = omitEmptyIds({
      ...person,
      slug,
      instagramUrl: person.instagramUrl?.trim() ? person.instagramUrl.trim() : null,
      quotes: person.quotes.filter((quote) => quote.body.trim()),
      images: person.images.filter((image) => image.alt.trim()),
    });
    setError(null);
    setNotice(null);
    try {
      const saved = await adminFetch<AdminOne<AdminInfluencer>>("influencers", { method: "POST", body: JSON.stringify(payload) });
      if (isNew || !person.id) {
        router.push(`/admin/influencers/${saved.item.id || saved.item.slug}`);
        router.refresh();
        return;
      }
      setPerson(saved.item);
      setNotice("Influencer salvo.");
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "Não deu para salvar.");
    }
  }

  if (!person) return error ? <Notice tone="error">{error}</Notice> : <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <form className="mx-auto max-w-4xl space-y-4" onSubmit={(event) => void save(event)}>
      <Link href="/admin/influencers" className="text-sm text-lime">Voltar</Link>
      <h1 className="font-display text-6xl leading-none">{isNew ? "Novo influencer" : person.name}</h1>
      <p className="text-sm text-muted-foreground">Não invente fala nem foto de pessoa real. Frase e história ficam vazias até você escrever. Sem promessa de saúde.</p>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="ok">{notice}</Notice> : null}
      <Section title="Perfil">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Nome"><Input aria-label="Nome" value={person.name} onChange={(event) => {
            const name = event.target.value;
            setPerson((current) => {
              if (!current) return current;
              if (slugEdited) return { ...current, name };
              return { ...current, name, slug: uniqueSlug(name, knownSlugs, current.id ? current.slug : undefined) };
            });
          }} required /></Field>
          <Field label="Slug"><Input aria-label="Slug" value={person.slug} onChange={(event) => { setSlugEdited(true); update({ slug: slugify(event.target.value) }); }} /></Field>
          <Field label="@ Instagram"><Input aria-label="Handle" value={person.handle} onChange={(event) => update({ handle: event.target.value })} required /></Field>
          <Field label="Link do perfil"><Input aria-label="Instagram" placeholder="https://instagram.com/..." value={person.instagramUrl ?? ""} onChange={(event) => update({ instagramUrl: event.target.value || null })} /></Field>
          <Field label="Cidade"><Input aria-label="Cidade" value={person.city} onChange={(event) => update({ city: event.target.value })} /></Field>
          <Field label="Esporte"><Input aria-label="Esporte" value={person.sport} onChange={(event) => update({ sport: event.target.value })} /></Field>
          <Field label="Seguidores"><Input aria-label="Seguidores" value={person.followers} onChange={(event) => update({ followers: event.target.value })} /></Field>
          <Field label="Cor"><Input aria-label="Cor" value={person.accent} onChange={(event) => update({ accent: event.target.value })} /></Field>
          <SelectField label="Cupom" value={person.couponCode ?? ""} onChange={(couponCode) => update({ couponCode: couponCode || null })}>
            <option value="">Nenhum</option>
            {coupons.map((coupon) => <option key={coupon.id} value={coupon.code}>{coupon.code}</option>)}
          </SelectField>
          <Field label="Desconto (%)" hint="Teto de 30%.">
            <Input aria-label="Desconto" type="number" min={0} max={30} value={person.discountPercent ?? 0} onChange={(event) => update({ discountPercent: Number(event.target.value) })} />
          </Field>
        </div>
        <TextArea label="Bio" value={person.bio} onChange={(bio) => update({ bio })} />
        <TextArea label="História curta" value={person.story} onChange={(story) => update({ story })} />
        <CheckRow label="Ativo" checked={person.active} onChange={(active) => update({ active })} />
      </Section>
      <Section title="Produtos">
        <div className="grid gap-2 md:grid-cols-2">
          {products.map((product) => (
            <CheckRow
              key={product.id}
              label={product.name}
              checked={person.productIds.includes(product.id)}
              onChange={(checked) => update({ productIds: checked ? [...person.productIds, product.id] : person.productIds.filter((id) => id !== product.id) })}
            />
          ))}
        </div>
      </Section>
      <Section title="Frases" action={<Button type="button" variant="outline" className="rounded-full" onClick={() => update({ quotes: [...person.quotes, { id: "", body: "", position: person.quotes.length }] })}>Adicionar</Button>}>
        {person.quotes.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma frase. A página de collab mostra no máximo quatro.</p> : null}
        {person.quotes.map((quote, index) => (
          <Field key={index} label={`Frase ${index + 1}`}>
            <Input aria-label={`Frase ${index + 1}`} value={quote.body} onChange={(event) => update({ quotes: person.quotes.map((item, itemIndex) => itemIndex === index ? { ...item, body: event.target.value } : item) })} />
          </Field>
        ))}
      </Section>
      <Section title="Fotos" action={<Button type="button" variant="outline" className="rounded-full" onClick={() => update({ images: [...person.images, { id: "", url: null, alt: "", caption: "", instagramPostUrl: null, fallbackHex: person.accent, position: person.images.length }] })}>Adicionar</Button>}>
        <p className="text-sm text-muted-foreground">Cada foto leva ao post no Instagram. Sem foto, a cor reserva segura o lugar. Texto alternativo é obrigatório.</p>
        {person.images.map((image, index) => (
          <div key={index} className="grid gap-3 rounded-2xl border border-white/10 p-3 md:grid-cols-2">
            <Field label="Texto alternativo"><Input aria-label={`Texto alternativo ${index + 1}`} value={image.alt} onChange={(event) => update({ images: person.images.map((item, itemIndex) => itemIndex === index ? { ...item, alt: event.target.value } : item) })} /></Field>
            <Field label="Legenda"><Input aria-label={`Legenda ${index + 1}`} value={image.caption} onChange={(event) => update({ images: person.images.map((item, itemIndex) => itemIndex === index ? { ...item, caption: event.target.value } : item) })} /></Field>
            <ImageUrlField label="Arquivo ou URL" url={image.url ?? ""} alt={image.alt} onChange={(url) => update({ images: person.images.map((item, itemIndex) => itemIndex === index ? { ...item, url: url || null } : item) })} />
            <Field label="Cor reserva"><Input aria-label={`Cor ${index + 1}`} value={image.fallbackHex ?? ""} onChange={(event) => update({ images: person.images.map((item, itemIndex) => itemIndex === index ? { ...item, fallbackHex: event.target.value || null } : item) })} /></Field>
            <Field label="Link do post"><Input aria-label={`Link do post ${index + 1}`} placeholder="https://" value={image.instagramPostUrl ?? ""} onChange={(event) => update({ images: person.images.map((item, itemIndex) => itemIndex === index ? { ...item, instagramPostUrl: event.target.value || null } : item) })} /></Field>
          </div>
        ))}
      </Section>
      <Button type="submit" className="rounded-full">Salvar</Button>
    </form>
  );
}

export function PostEditor({ postId }: { postId: string }) {
  const isNew = postId === "novo";
  const router = useRouter();
  const [post, setPost] = useState<AdminPost | null>(isNew ? blankPost() : null);
  const [authors, setAuthors] = useState<AdminAuthor[]>([]);
  const [influencers, setInfluencers] = useState<AdminInfluencer[]>([]);
  const [knownSlugs, setKnownSlugs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [authorList, people, posts] = await Promise.all([
          adminFetch<AdminList<AdminAuthor>>("authors?pageSize=100"),
          adminFetch<AdminList<AdminInfluencer>>("influencers?pageSize=100"),
          adminFetch<AdminList<AdminPost>>("posts?pageSize=100"),
        ]);
        if (cancelled) return;
        setAuthors(authorList.items);
        setInfluencers(people.items);
        setKnownSlugs(posts.items.map((item) => item.slug));
        if (!isNew) {
          const found = posts.items.find((item) => item.id === postId || item.slug === postId);
          if (!found) {
            setError("A API não tem GET /v1/admin/posts/:slug. Esse post não está na lista.");
            return;
          }
          setPost(found);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof AdminApiError ? caught.message : "Não deu para abrir o post.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [isNew, postId]);

  function update(patch: Partial<AdminPost>) {
    setPost((current) => (current ? { ...current, ...patch } : current));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!post) return;
    const problem = blockProblem(post.blocks);
    if (problem) {
      setNotice(null);
      setError(problem);
      return;
    }
    const slug = isNew || !post.id ? uniqueSlug(post.slug || post.title, knownSlugs) : slugify(post.slug || post.title);
    const payload = omitEmptyIds({
      ...post,
      slug,
      publishedAt: publishedDay(post.publishedAt),
      blocks: readyBlocks(post.blocks),
    });
    setError(null);
    try {
      const saved = await adminFetch<AdminOne<AdminPost>>("posts", { method: "POST", body: JSON.stringify(payload) });
      if (isNew || !post.id) {
        router.push(`/admin/blog/${saved.item.id || saved.item.slug}`);
        router.refresh();
        return;
      }
      setPost(saved.item);
      setNotice("Post salvo.");
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "Não deu para salvar.");
    }
  }

  if (!post) return error ? <Notice tone="error">{error}</Notice> : <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <form className="mx-auto max-w-5xl space-y-4" onSubmit={(event) => void save(event)}>
      <Link href="/admin/blog" className="text-sm text-lime">Voltar</Link>
      <h1 className="font-display text-6xl leading-none">{isNew ? "Novo post" : post.title}</h1>
      <Notice tone="warn">Sem promessa de saúde, sem cura e sem número de registro real. O rótulo segue NI-DEMO.</Notice>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="ok">{notice}</Notice> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Título"><Input aria-label="Título" value={post.title} onChange={(event) => {
          const title = event.target.value;
          const current = post.id ? post.slug : undefined;
          const auto = !post.slug || post.slug === slugify(post.title) || post.slug === uniqueSlug(post.title, knownSlugs, current);
          update({ title, slug: auto ? uniqueSlug(title, knownSlugs, current) : post.slug });
        }} required /></Field>
        <Field label="Slug"><Input aria-label="Slug" value={post.slug} onChange={(event) => update({ slug: slugify(event.target.value) })} /></Field>
        <Field label="Categoria"><Input aria-label="Categoria do post" value={post.category} onChange={(event) => update({ category: event.target.value })} /></Field>
        <SelectField label="Status" value={post.status} onChange={(status) => update({ status: status as AdminPost["status"] })}>
          {POST_STATUSES.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
        </SelectField>
        <Field label="Data"><Input aria-label="Data de publicação" type="datetime-local" value={localValue(post.publishedAt)} onChange={(event) => update({ publishedAt: fromLocal(event.target.value) })} /></Field>
        <Field label="Minutos de leitura"><Input aria-label="Minutos de leitura" type="number" min={1} value={post.readMinutes} onChange={(event) => update({ readMinutes: Number(event.target.value) })} /></Field>
        <SelectField label="Autor" value={post.authorId ?? ""} onChange={(authorId) => update({ authorId: authorId || null })}>
          <option value="">Nenhum</option>
          {authors.map((author) => <option key={author.id} value={author.id}>{author.name}</option>)}
        </SelectField>
        <SelectField label="Influencer" value={post.influencerId ?? ""} onChange={(influencerId) => update({ influencerId: influencerId || null })}>
          <option value="">Nenhum</option>
          {influencers.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </SelectField>
        <Field label="Cor da capa"><Input aria-label="Cor da capa" value={post.coverHex ?? ""} onChange={(event) => update({ coverHex: event.target.value || null })} /></Field>
        <Field label="Capa (https)"><Input aria-label="Capa" value={post.coverUrl ?? ""} onChange={(event) => update({ coverUrl: event.target.value || null })} /></Field>
      </div>
      <TextArea label="Resumo" value={post.excerpt} onChange={(excerpt) => update({ excerpt })} />
      <Section title="SEO">
        <Field label="Título de busca"><Input aria-label="Título de busca" value={post.seoTitle} onChange={(event) => update({ seoTitle: event.target.value })} /></Field>
        <TextArea label="Descrição de busca" value={post.seoDescription} onChange={(seoDescription) => update({ seoDescription })} rows={3} />
        <Field label="Imagem de compartilhamento"><Input aria-label="Imagem de compartilhamento" value={post.shareImageUrl ?? ""} onChange={(event) => update({ shareImageUrl: event.target.value || null })} /></Field>
      </Section>
      <Section title="Blocos">
        <BlockEditor blocks={post.blocks} onChange={(blocks) => update({ blocks })} />
      </Section>
      <Button type="submit" className="rounded-full">Salvar</Button>
    </form>
  );
}

export function OrderEditor({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void adminFetch<AdminList<AdminOrder>>("orders")
      .then((result) => {
        if (cancelled) return;
        const found = result.items.find((item) => item.id === orderId);
        if (!found) {
          setError("A API não tem GET /v1/admin/orders/:id. Esse pedido não está na lista.");
          return;
        }
        setOrder(found);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof AdminApiError ? caught.message : "Não deu para abrir o pedido.");
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!order) return;
    setError(null);
    try {
      const saved = await adminFetch<AdminOne<AdminOrder>>(`orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: order.status,
          paymentStatus: order.paymentStatus,
          trackingCode: order.trackingCode,
          shipmentStatus: order.shipmentStatus,
        }),
      });
      setOrder(saved.item);
      setNotice("Pedido atualizado.");
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "Não deu para salvar.");
    }
  }

  if (!order) return error ? <Notice tone="error">{error}</Notice> : <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <form className="mx-auto max-w-3xl space-y-4" onSubmit={(event) => void save(event)}>
      <Link href="/admin/pedidos" className="text-sm text-lime">Voltar</Link>
      <h1 className="font-display text-6xl leading-none">{order.code}</h1>
      <p className="text-sm text-muted-foreground">{order.email} · pagamento simulado ({order.paymentMethod}).</p>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="ok">{notice}</Notice> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField label="Status" value={order.status} onChange={(status) => setOrder({ ...order, status: status as AdminOrder["status"] })}>
          {ORDER_STATUSES.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
        </SelectField>
        <Field label="Status do pagamento"><Input aria-label="Status do pagamento" value={order.paymentStatus} onChange={(event) => setOrder({ ...order, paymentStatus: event.target.value })} /></Field>
        <Field label="Rastreio"><Input aria-label="Rastreio" value={order.trackingCode} onChange={(event) => setOrder({ ...order, trackingCode: event.target.value })} /></Field>
        <Field label="Status do envio"><Input aria-label="Status do envio" value={order.shipmentStatus} onChange={(event) => setOrder({ ...order, shipmentStatus: event.target.value })} /></Field>
      </div>
      <ul className="space-y-2 text-sm">
        {order.lines.map((line) => (
          <li key={line.id} className="flex justify-between gap-3 border-b border-white/10 py-2">
            <span>{line.quantity}× {line.name}</span>
            <span>{formatBRL(line.unitPriceCents * line.quantity)}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm">Total {formatBRL(order.totalCents)} · frete {formatBRL(order.shippingCents)} · Pix {formatBRL(order.pixCents)}</p>
      <Button type="submit" className="rounded-full">Salvar</Button>
    </form>
  );
}
