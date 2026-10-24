"use client";

import { CollectionScreen, type FieldSpec } from "@/components/admin/collection-screen";
import { CheckRow, Field, Notice, Section, SelectField, StatusPill, TextArea } from "@/components/admin/fields";
import { BannerLink } from "@/components/content/banner-link";
import { bannerHrefError } from "@/lib/safe-href";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch, AdminApiError } from "@/lib/admin-fetch";
import type {
  AdminAuthor,
  AdminBanner,
  AdminCoupon,
  AdminCustomer,
  AdminDrop,
  AdminInfluencer,
  AdminList,
  AdminLoyalty,
  AdminNamed,
  AdminOne,
  AdminOrder,
  AdminPost,
  AdminProduct,
  AdminPromotion,
  AdminQuizOption,
  AdminQuizQuestion,
  AdminReview,
  AdminScratchPrize,
  AdminUgc,
  AdminVideo,
  DropStatus,
  ReviewStatus,
} from "@/lib/admin-types";
import { uniqueSlug } from "@/lib/admin-payload";
import { slugify } from "@/lib/admin-types";
import { formatBRL } from "@pulso/domain";
import Link from "next/link";
import { useEffect, useState } from "react";

function localValue(iso: string | null): string {
  return iso ? iso.slice(0, 16) : "";
}

function fromLocal(value: string): string | null {
  if (!value) return null;
  return value.length === 16 ? `${value}:00-03:00` : value;
}

export function KitsScreen() {
  const [kits, setKits] = useState<AdminProduct[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [name, setName] = useState("");
  const [discount, setDiscount] = useState(12);
  const [rows, setRows] = useState<{ productId: string; quantity: number }[]>([{ productId: "", quantity: 1 }]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function reload() {
    const [kitList, productList] = await Promise.all([
      adminFetch<AdminList<AdminProduct>>("kits?status=ativos&pageSize=100"),
      adminFetch<AdminList<AdminProduct>>("products?status=ativos&pageSize=100"),
    ]);
    setKits(kitList.items);
    setProducts(productList.items.filter((product) => !product.isKit));
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [kitList, productList] = await Promise.all([
          adminFetch<AdminList<AdminProduct>>("kits?status=ativos&pageSize=100"),
          adminFetch<AdminList<AdminProduct>>("products?status=ativos&pageSize=100"),
        ]);
        if (cancelled) return;
        setKits(kitList.items);
        setProducts(productList.items.filter((product) => !product.isKit));
      } catch (caught) {
        if (!cancelled) setError(caught instanceof AdminApiError ? caught.message : "Não deu para listar os kits.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function kitDiscount(kit: AdminProduct): number {
    const variant = kit.variants[0];
    if (!variant?.compareAtCents || variant.compareAtCents <= variant.priceCents) return 0;
    return Math.min(12, Math.max(0, Math.round((1 - variant.priceCents / variant.compareAtCents) * 100)));
  }

  function edit(kit: AdminProduct) {
    setEditingId(kit.id);
    setName(kit.name);
    setDiscount(kitDiscount(kit));
    setRows(kit.kitItems.length ? kit.kitItems.map((item) => ({ productId: item.productId, quantity: item.quantity })) : [{ productId: "", quantity: 1 }]);
    setNotice(null);
    setError(null);
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setDiscount(12);
    setRows([{ productId: "", quantity: 1 }]);
  }

  async function save() {
    setError(null);
    setNotice(null);
    const body = { name, discountPercent: discount, kitItems: rows.filter((row) => row.productId) };
    try {
      if (editingId) {
        await adminFetch<AdminOne<AdminProduct>>(`kits/${encodeURIComponent(editingId)}`, { method: "PATCH", body: JSON.stringify(body) });
        setNotice("Kit atualizado.");
      } else {
        await adminFetch<AdminOne<AdminProduct>>("kits", { method: "POST", body: JSON.stringify(body) });
        setNotice("Kit criado como rascunho. O preço sai da soma dos produtos, com o desconto por cima.");
      }
      resetForm();
      await reload();
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "Não deu para montar o kit.");
    }
  }

  async function archive(id: string) {
    setError(null);
    try {
      await adminFetch(`kits/${id}`, { method: "DELETE" });
      setNotice("Kit arquivado.");
      await reload();
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "Não deu para arquivar.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">Catálogo</p>
        <h1 className="font-display text-6xl leading-none">Kits</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">O desconto do kit fica entre 0% e 12% e não soma com cupom percentual: na loja vale o maior, com teto de 30%. O estoque do combo usa o que os produtos realmente têm.</p>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="ok">{notice}</Notice> : null}
      <Section title="Montar">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Nome"><Input aria-label="Nome do kit" value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Desconto (%)" hint="Teto de 12%.">
            <Input aria-label="Desconto do kit" type="number" min={0} max={12} value={discount} onChange={(event) => setDiscount(Number(event.target.value))} />
          </Field>
        </div>
        {rows.map((row, index) => (
          <div key={index} className="grid gap-3 md:grid-cols-[1fr_8rem]">
            <SelectField label={`Produto ${index + 1}`} value={row.productId} onChange={(productId) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, productId } : item))}>
              <option value="">Escolher</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </SelectField>
            <Field label="Qtd">
              <Input aria-label={`Quantidade ${index + 1}`} type="number" min={1} value={row.quantity} onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(event.target.value) } : item))} />
            </Field>
          </div>
        ))}
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setRows([...rows, { productId: "", quantity: 1 }])}>Adicionar produto</Button>
          <Button type="button" className="rounded-full" onClick={() => void save()}>{editingId ? "Salvar kit" : "Criar kit"}</Button>
          {editingId ? <Button type="button" variant="outline" className="rounded-full" onClick={resetForm}>Cancelar</Button> : null}
        </div>
      </Section>
      <ul className="space-y-2">
        {kits.map((kit) => (
          <li key={kit.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[1.2rem] border border-white/10 px-4 py-3">
            <div>
              <p className="font-display text-3xl leading-none">{kit.name}</p>
              <p className="text-xs text-muted-foreground">{kit.kitItems.map((item) => `${item.quantity}× ${item.productId}`).join(" · ") || "Sem itens"}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" type="button" onClick={() => edit(kit)}>Editar</Button>
              <Button asChild size="sm" variant="outline"><Link href={`/admin/produtos/${kit.id}`}>Editar ficha</Link></Button>
              <Button size="sm" variant="outline" type="button" onClick={() => void archive(kit.id)}>Arquivar</Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NamedCollection({ resource, eyebrow, title, description }: { resource: "categories" | "goals"; eyebrow: string; title: string; description: string }) {
  const fields: FieldSpec<AdminNamed>[] = [
    { kind: "text", key: "name", label: "Nome" },
    { kind: "text", key: "slug", label: "Slug", hint: "Letras minúsculas e hífen. Vazio, sai do nome. Depois de gravar, o slug não muda." },
    { kind: "number", key: "position", label: "Ordem" },
    { kind: "text", key: "imageUrl", label: "Imagem (https)" },
    { kind: "textarea", key: "blurb", label: "Texto curto" },
  ];
  return (
    <CollectionScreen<AdminNamed>
      eyebrow={eyebrow}
      title={title}
      description={description}
      resource={resource}
      write="post"
      listQuery={resource === "categories" ? "kind=categoria" : ""}
      rowKey={(item) => item.slug}
      prepare={(draft, items, exists) => ({
        ...draft,
        slug: exists ? slugify(draft.slug) : uniqueSlug(draft.slug || draft.name, items.map((item) => item.slug)),
        blurb: draft.blurb?.trim() ? draft.blurb : null,
        imageUrl: draft.imageUrl?.trim() ? draft.imageUrl.trim() : null,
      })}
      columns={[
        { header: "Nome", cell: (item) => item.name },
        { header: "Slug", cell: (item) => item.slug },
        { header: "Ordem", cell: (item) => item.position },
      ]}
      blank={(): AdminNamed => ({ slug: "", name: "", blurb: "", imageUrl: null, position: 0 })}
      fields={fields}
    />
  );
}

export function CategoriesScreen() {
  return (
    <div className="mx-auto max-w-5xl space-y-12">
      <NamedCollection resource="categories" eyebrow="Catálogo" title="Categorias" description="A rota é /categories, identificada pelo slug. Apagar só se nenhum produto usar." />
      <NamedCollection resource="goals" eyebrow="Quiz" title="Objetivos" description="A rota é /goals, não /categories. O slug é o identificador." />
    </div>
  );
}

export function InfluencerListScreen() {
  return (
    <div className="mx-auto max-w-5xl">
      <CollectionScreen<AdminInfluencer>
        eyebrow="Collab"
        title="Influencers"
        description="Fotos, história, frases, Instagram, cupom e produtos. Desativar não apaga a página."
        resource="influencers"
        newHref="/admin/influencers/novo"
        editHref={(item) => `/admin/influencers/${item.slug}`}
        rowKey={(item) => item.slug}
        removeLabel="Desativar"
        columns={[
          { header: "Nome", cell: (item) => item.name },
          { header: "@", cell: (item) => item.handle },
          { header: "Cupom", cell: (item) => item.couponCode ?? "—" },
          { header: "Estado", cell: (item) => <StatusPill status={item.active ? "ativo" : "oculto"} /> },
        ]}
      />
    </div>
  );
}

export function BlogScreen() {
  const [influencers, setInfluencers] = useState<AdminInfluencer[]>([]);
  useEffect(() => {
    void adminFetch<AdminList<AdminInfluencer>>("influencers?pageSize=100").then((list) => setInfluencers(list.items)).catch(() => setInfluencers([]));
  }, []);
  const authorFields: FieldSpec<AdminAuthor>[] = [
    { kind: "text", key: "name", label: "Nome" },
    { kind: "text", key: "photoUrl", label: "Foto (https)" },
    { kind: "select", key: "influencerId", label: "Ligar a um influencer", nullable: true, options: influencers.map((person) => ({ value: person.id, label: person.name })) },
    { kind: "textarea", key: "bio", label: "Bio" },
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-12">
      <CollectionScreen<AdminPost>
        eyebrow="Conteúdo"
        title="Blog"
        description="O editor abre título, blocos, autor e SEO. Arquivar não apaga o post."
        resource="posts"
        newHref="/admin/blog/novo"
        editHref={(item) => `/admin/blog/${item.slug}`}
        rowKey={(item) => item.slug}
        removeLabel="Arquivar"
        columns={[
          { header: "Título", cell: (item) => item.title },
          { header: "Status", cell: (item) => <StatusPill status={item.status} /> },
          { header: "Blocos", cell: (item) => item.blocks.length },
        ]}
      />
      <CollectionScreen<AdminAuthor>
        eyebrow="Conteúdo"
        title="Autores"
        description="Um autor pode ser alguém de fora ou um influencer da collab."
        resource="authors"
        write="post"
        rowKey={(item) => item.id}
        blank={() => ({ id: "", name: "", photoUrl: null, bio: "", influencerId: null })}
        fields={authorFields}
        columns={[
          { header: "Nome", cell: (item) => item.name },
          { header: "Influencer", cell: (item) => item.influencerId ?? "—" },
        ]}
      />
    </div>
  );
}

export function PromotionsScreen() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<AdminNamed[]>([]);
  useEffect(() => {
    void Promise.all([
      adminFetch<AdminList<AdminProduct>>("products?status=todos&pageSize=100"),
      adminFetch<AdminList<AdminNamed>>("categories?kind=categoria&pageSize=100"),
    ]).then(([productList, categoryList]) => {
      setProducts(productList.items);
      setCategories(categoryList.items);
    }).catch(() => undefined);
  }, []);
  return (
    <div className="mx-auto max-w-5xl">
      <CollectionScreen<AdminPromotion>
        eyebrow="Preço"
        title="Promoções"
        description="Preço riscado por período, num produto ou numa categoria. Percentual de 1% a 30%."
        resource="promotions"
        write="post"
        blank={() => ({ id: "", name: "", kind: "percent", value: 10, targetType: "produto", productId: null, categoryId: null, startsAt: null, endsAt: null, badge: null, active: true })}
        columns={[
          { header: "Nome", cell: (item) => item.name },
          { header: "Alvo", cell: (item) => item.productId ?? item.categoryId ?? "—" },
          { header: "Estado", cell: (item) => <StatusPill status={item.active ? "ativo" : "oculto"} /> },
        ]}
        renderEditor={(draft, update) => (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nome"><Input aria-label="Nome da promoção" value={draft.name} onChange={(event) => update({ name: event.target.value })} /></Field>
            <SelectField label="Tipo" value={draft.kind} onChange={(kind) => update({ kind: kind as AdminPromotion["kind"] })}>
              <option value="percent">Percentual</option>
              <option value="fixed_cents">Centavos fixos</option>
              <option value="compare_at">Preço riscado</option>
            </SelectField>
            <Field label={draft.kind === "percent" ? "Valor (%)" : "Valor (centavos)"} hint="Percentual até 30.">
              <Input aria-label="Valor da promoção" type="number" value={draft.value} onChange={(event) => update({ value: Number(event.target.value) })} />
            </Field>
            <SelectField label="Alvo" value={draft.targetType} onChange={(targetType) => update({ targetType: targetType as AdminPromotion["targetType"], productId: null, categoryId: null })}>
              <option value="produto">Produto</option>
              <option value="categoria">Categoria</option>
            </SelectField>
            {draft.targetType === "produto" ? (
              <SelectField label="Produto" value={draft.productId ?? ""} onChange={(productId) => update({ productId })}>
                <option value="">Escolher</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </SelectField>
            ) : (
              <SelectField label="Categoria" value={draft.categoryId ?? ""} onChange={(categoryId) => update({ categoryId })}>
                <option value="">Escolher</option>
                {categories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
              </SelectField>
            )}
            <Field label="Começa" hint="Horário de São Paulo.">
              <Input aria-label="Início da promoção" type="datetime-local" value={localValue(draft.startsAt)} onChange={(event) => update({ startsAt: fromLocal(event.target.value) })} />
            </Field>
            <Field label="Termina">
              <Input aria-label="Fim da promoção" type="datetime-local" value={localValue(draft.endsAt)} onChange={(event) => update({ endsAt: fromLocal(event.target.value) })} />
            </Field>
            <Field label="Selo"><Input aria-label="Selo" value={draft.badge ?? ""} onChange={(event) => update({ badge: event.target.value || null })} /></Field>
            <CheckRow label="Ativa" checked={draft.active} onChange={(active) => update({ active })} />
          </div>
        )}
      />
    </div>
  );
}

export function DropsScreen() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  useEffect(() => {
    void adminFetch<AdminList<AdminProduct>>("products?status=todos&pageSize=100").then((list) => setProducts(list.items)).catch(() => setProducts([]));
  }, []);
  return (
    <div className="mx-auto max-w-5xl">
      <CollectionScreen<AdminDrop>
        eyebrow="Edição"
        title="Drops"
        description="Se houver sabor, o que resta é o estoque desse sabor. Não dá para digitar um número menor. Encerrar manda a edição para o arquivo."
        resource="drops"
        removeLabel="Encerrar"
        blank={() => ({ id: "", edition: "", name: "", productId: null, flavorId: null, startsAt: null, endsAt: null, unitsTotal: null, unitsLeft: null, teaser: "", heroImageUrl: null, story: "", status: "em_breve" })}
        columns={[
          { header: "Edição", cell: (item) => item.edition },
          { header: "Status", cell: (item) => <StatusPill status={item.status} /> },
          { header: "Resta", cell: (item) => item.unitsLeft === null ? "—" : item.unitsTotal === null ? String(item.unitsLeft) : `${item.unitsLeft} de ${item.unitsTotal}` },
        ]}
        renderEditor={(draft, update) => {
          const product = products.find((item) => item.id === draft.productId);
          const flavor = product?.flavors.find((item) => item.id === draft.flavorId);
          return (
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Edição"><Input aria-label="Edição" value={draft.edition} onChange={(event) => update({ edition: event.target.value })} /></Field>
              <Field label="Nome"><Input aria-label="Nome do drop" value={draft.name} onChange={(event) => update({ name: event.target.value })} /></Field>
              <SelectField label="Status" value={draft.status} onChange={(status) => update({ status: status as DropStatus })}>
                <option value="em_breve">Em breve</option>
                <option value="no_ar">No ar</option>
                <option value="encerrado">Encerrado</option>
              </SelectField>
              <SelectField label="Produto" value={draft.productId ?? ""} onChange={(productId) => update({ productId: productId || null, flavorId: null })}>
                <option value="">Sem produto</option>
                {products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </SelectField>
              <SelectField label="Sabor" value={draft.flavorId ?? ""} onChange={(flavorId) => update({ flavorId: flavorId || null })}>
                <option value="">Vários ou nenhum</option>
                {product?.flavors.map((item) => <option key={item.id} value={item.id}>{item.name} · estoque {item.stock}</option>)}
              </SelectField>
              <Field label="Lote total" hint="Vazio se o mock só conhece o que resta. Com sabor, o resto vem do estoque.">
                <Input aria-label="Lote total" type="number" value={draft.unitsTotal ?? ""} onChange={(event) => update({ unitsTotal: event.target.value === "" ? null : Number(event.target.value) })} />
              </Field>
              <Field label="O que resta" hint={flavor ? `Travado no estoque do sabor: ${flavor.stock}.` : "Sem sabor, este número é o que você informar."}>
                <Input aria-label="Unidades restantes" type="number" value={flavor ? flavor.stock : (draft.unitsLeft ?? "")} disabled={Boolean(flavor)} onChange={(event) => update({ unitsLeft: event.target.value === "" ? null : Number(event.target.value) })} />
              </Field>
              <Field label="Começa"><Input aria-label="Início do drop" type="datetime-local" value={localValue(draft.startsAt)} onChange={(event) => update({ startsAt: fromLocal(event.target.value) })} /></Field>
              <Field label="Termina"><Input aria-label="Fim do drop" type="datetime-local" value={localValue(draft.endsAt)} onChange={(event) => update({ endsAt: fromLocal(event.target.value) })} /></Field>
              <div className="md:col-span-2"><TextArea label="Teaser" value={draft.teaser} onChange={(teaser) => update({ teaser })} /></div>
              <div className="md:col-span-2"><TextArea label="História do sabor" value={draft.story} onChange={(story) => update({ story })} /></div>
              <Field label="Imagem de capa (https)"><Input aria-label="Imagem de capa" value={draft.heroImageUrl ?? ""} onChange={(event) => update({ heroImageUrl: event.target.value || null })} /></Field>
            </div>
          );
        }}
      />
    </div>
  );
}

export function QuizScreen() {
  return (
    <div className="mx-auto max-w-5xl">
      <CollectionScreen<AdminQuizQuestion>
        eyebrow="Descoberta"
        title="Quiz"
        description="Perguntas, opções e pesos. A loja ainda responde com a regra fixa do domínio até o backend publicar o quiz."
        resource="quiz"
        write="post"
        blank={() => ({ id: "", prompt: "", answerKey: "", position: 0, options: [{ id: "", label: "", value: "", position: 0, weights: {} }] })}
        columns={[
          { header: "Pergunta", cell: (item) => item.prompt },
          { header: "Opções", cell: (item) => item.options.length },
        ]}
        renderEditor={(draft, update) => <QuizFields draft={draft} update={update} />}
      />
    </div>
  );
}

function QuizFields({ draft, update }: { draft: AdminQuizQuestion; update: (patch: Partial<AdminQuizQuestion>) => void }) {
  function setOption(index: number, patch: Partial<AdminQuizOption>) {
    update({ options: draft.options.map((option, optionIndex) => optionIndex === index ? { ...option, ...patch } : option) });
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Pergunta"><Input aria-label="Pergunta" value={draft.prompt} onChange={(event) => update({ prompt: event.target.value })} /></Field>
        <Field label="Chave" hint="goal, days, caffeine, flavor ou budget.">
          <Input aria-label="Chave da resposta" value={draft.answerKey} onChange={(event) => update({ answerKey: event.target.value })} />
        </Field>
        <Field label="Ordem"><Input aria-label="Ordem" type="number" value={draft.position} onChange={(event) => update({ position: Number(event.target.value) })} /></Field>
      </div>
      {draft.options.map((option, index) => (
        <div key={option.id || index} className="grid gap-3 rounded-2xl border border-white/10 p-3 md:grid-cols-2">
          <Field label="Rótulo"><Input aria-label={`Rótulo ${index + 1}`} value={option.label} onChange={(event) => setOption(index, { label: event.target.value })} /></Field>
          <Field label="Valor"><Input aria-label={`Valor ${index + 1}`} value={option.value} onChange={(event) => setOption(index, { value: event.target.value })} /></Field>
          <div className="md:col-span-2">
            <TextArea
              label="Pesos (chave e número, um por linha)"
              value={Object.entries(option.weights).map(([key, value]) => `${key} ${value}`).join("\n")}
              onChange={(text) => {
                const weights: Record<string, number> = {};
                for (const line of text.split("\n")) {
                  const [key, raw] = line.trim().split(/\s+/);
                  if (!key || !raw) continue;
                  const amount = Number(raw);
                  if (Number.isFinite(amount)) weights[key] = Math.trunc(amount);
                }
                setOption(index, { weights });
              }}
            />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" className="rounded-full" onClick={() => update({ options: [...draft.options, { id: "", label: "", value: "", position: draft.options.length, weights: {} }] })}>Adicionar opção</Button>
    </div>
  );
}

export function ReviewsScreen() {
  return (
    <div className="mx-auto max-w-5xl">
      <CollectionScreen<AdminReview>
        eyebrow="Casa"
        title="Avaliações"
        description="Aprovar, ocultar ou responder. A avaliação em si não se apaga."
        resource="reviews"
        removeLabel=""
        columns={[
          { header: "Autor", cell: (item) => item.author },
          { header: "Produto", cell: (item) => item.productId },
          { header: "Status", cell: (item) => <StatusPill status={item.status} /> },
        ]}
        renderEditor={(draft, update) => (
          <div className="space-y-3">
            <p className="font-display text-3xl leading-none">{draft.title}</p>
            <p className="text-sm text-muted-foreground">{draft.body}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <SelectField label="Status" value={draft.status} onChange={(status) => update({ status: status as ReviewStatus })}>
                <option value="pendente">Pendente</option>
                <option value="aprovada">Aprovada</option>
                <option value="oculta">Oculta</option>
              </SelectField>
              <Field label="Nota"><Input aria-label="Nota" type="number" min={1} max={5} value={draft.rating} onChange={(event) => update({ rating: Number(event.target.value) })} /></Field>
            </div>
            <TextArea label="Resposta da casa" value={draft.reply} onChange={(reply) => update({ reply })} />
          </div>
        )}
      />
    </div>
  );
}

export function SocialScreen() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  useEffect(() => {
    void adminFetch<AdminList<AdminProduct>>("products?status=todos&pageSize=100").then((list) => setProducts(list.items)).catch(() => setProducts([]));
  }, []);
  const ugcFields: FieldSpec<AdminUgc>[] = [
    { kind: "text", key: "author", label: "Autor" },
    { kind: "text", key: "handle", label: "@" },
    { kind: "textarea", key: "caption", label: "Legenda" },
    { kind: "number", key: "likes", label: "Curtidas" },
    { kind: "text", key: "accent", label: "Cor (#hex)" },
    { kind: "number", key: "position", label: "Ordem" },
    { kind: "select", key: "productId", label: "Produto", nullable: true, options: products.map((product) => ({ value: product.id, label: product.name })) },
    { kind: "check", key: "hidden", label: "Oculto" },
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-12">
      <CollectionScreen<AdminUgc>
        eyebrow="Social"
        title="Posts"
        description="Fotos com link, sem API do Instagram. Ocultar tira da grade."
        resource="ugc"
        write="post"
        blank={() => ({ id: "", author: "", handle: "@", caption: "", likes: 0, accent: "#d6ff3c", productId: null, position: 0, hidden: false })}
        fields={ugcFields}
        columns={[
          { header: "Autor", cell: (item) => item.author },
          { header: "Estado", cell: (item) => <StatusPill status={item.hidden ? "oculto" : "ativo"} /> },
        ]}
      />
      <CollectionScreen<AdminVideo>
        eyebrow="Social"
        title="Vídeos"
        description="Três cores de quadro e a transcrição que a faixa da home lê."
        resource="videos"
        rowKey={(item) => item.id || item.slug}
        write="post"
        blank={() => ({ id: "", slug: "", title: "", caption: "", duration: "0:15", frames: ["#d6ff3c", "#101402", "#ff3d8a"], transcript: ["Suplemento alimentar. Não é medicamento."], position: 0, hidden: false })}
        columns={[
          { header: "Título", cell: (item) => item.title },
          { header: "Duração", cell: (item) => item.duration },
        ]}
        renderEditor={(draft, update) => (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Título"><Input aria-label="Título do vídeo" value={draft.title} onChange={(event) => update({ title: event.target.value })} /></Field>
            <Field label="Duração"><Input aria-label="Duração" value={draft.duration} onChange={(event) => update({ duration: event.target.value })} /></Field>
            <div className="md:col-span-2"><TextArea label="Legenda" value={draft.caption} onChange={(caption) => update({ caption })} /></div>
            {draft.frames.map((frame, index) => (
              <Field key={index} label={`Quadro ${index + 1}`}>
                <Input aria-label={`Quadro ${index + 1}`} value={frame} onChange={(event) => update({ frames: draft.frames.map((item, itemIndex) => itemIndex === index ? event.target.value : item) as AdminVideo["frames"] })} />
              </Field>
            ))}
            <div className="md:col-span-2">
              <TextArea label="Transcrição (uma linha por fala)" value={draft.transcript.join("\n")} onChange={(value) => update({ transcript: value.split("\n").map((line) => line.trim()).filter(Boolean) })} />
            </div>
            <CheckRow label="Oculto" checked={draft.hidden} onChange={(hidden) => update({ hidden })} />
          </div>
        )}
      />
    </div>
  );
}

export function ScratchScreen() {
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  useEffect(() => {
    void adminFetch<AdminList<AdminCoupon>>("coupons?pageSize=100").then((list) => setCoupons(list.items)).catch(() => setCoupons([]));
  }, []);
  const fields: FieldSpec<AdminScratchPrize>[] = [
    { kind: "text", key: "label", label: "Nome" },
    { kind: "textarea", key: "detail", label: "Detalhe" },
    { kind: "number", key: "weight", label: "Chance", hint: "Número inteiro maior que zero. A soma das chances ativas forma o sorteio." },
    { kind: "number", key: "points", label: "Pontos" },
    { kind: "number", key: "position", label: "Ordem" },
    { kind: "select", key: "couponCode", label: "Cupom", nullable: true, options: coupons.map((coupon) => ({ value: coupon.code, label: coupon.code })) },
    { kind: "check", key: "active", label: "Ativo" },
  ];
  return (
    <div className="mx-auto max-w-5xl">
      <CollectionScreen
        eyebrow="Jogo"
        title="Raspadinha"
        description="Prêmios e chance. O sorteio da loja ainda usa a lista fixa do domínio até a API assumir."
        resource="scratch-prizes"
        write="post"
        blank={() => ({ id: "", label: "", detail: "", weight: 10, couponCode: null, points: null, active: true, position: 0 })}
        fields={fields}
        columns={[
          { header: "Prêmio", cell: (item) => item.label },
          { header: "Chance", cell: (item) => item.weight },
          { header: "Estado", cell: (item) => <StatusPill status={item.active ? "ativo" : "oculto"} /> },
        ]}
      />
    </div>
  );
}

export function LoyaltyScreen() {
  const [item, setItem] = useState<AdminLoyalty | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void adminFetch<AdminOne<AdminLoyalty>>("settings/loyalty")
      .then((result) => {
        if (!cancelled) setItem(result.item);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof AdminApiError ? caught.message : "Não deu para ler a fidelidade.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (!item) return;
    setError(null);
    setNotice(null);
    try {
      const saved = await adminFetch<AdminOne<AdminLoyalty>>("settings/loyalty", { method: "PATCH", body: JSON.stringify(item) });
      setItem(saved.item);
      setNotice("Salvo.");
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "Não deu para salvar.");
    }
  }

  if (!item) return <div className="mx-auto max-w-3xl">{error ? <Notice tone="error">{error}</Notice> : <p className="text-sm text-muted-foreground">Carregando…</p>}</div>;

  function set<K extends keyof AdminLoyalty>(key: K, value: AdminLoyalty[K]) {
    setItem((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">Casa</p>
        <h1 className="font-display text-6xl leading-none">Fidelidade</h1>
        <p className="mt-2 text-sm text-muted-foreground">Pix, kit e assinatura têm teto de 30%. Só o dono edita. A vitrine continua nas constantes do código até o backend ligar esta ficha.</p>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="ok">{notice}</Notice> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <NumberField label="Pontos por real" value={item.pointsPerReal} onChange={(pointsPerReal) => set("pointsPerReal", pointsPerReal)} />
        <NumberField label="Bônus Pix (multiplicador)" value={item.pixPointsBonus} onChange={(pixPointsBonus) => set("pixPointsBonus", pixPointsBonus)} />
        <NumberField label="Centavos por ponto" value={item.pointValueCents} onChange={(pointValueCents) => set("pointValueCents", pointValueCents)} />
        <NumberField label="Teto de resgate (0 a 1)" value={item.maxPointsRedeemRatio} onChange={(maxPointsRedeemRatio) => set("maxPointsRedeemRatio", maxPointsRedeemRatio)} />
        <NumberField label="Pontos de boas-vindas" value={item.welcomePoints} onChange={(welcomePoints) => set("welcomePoints", welcomePoints)} />
        <Field label="Frete grátis a partir de">
          <Input aria-label="Frete grátis" value={(item.freeShippingCents / 100).toFixed(2).replace(".", ",")} onChange={(event) => {
            const parsed = Number(event.target.value.replace(/\./g, "").replace(",", "."));
            if (Number.isFinite(parsed)) set("freeShippingCents", Math.round(parsed * 100));
          }} />
        </Field>
        <NumberField label="Pix (%)" value={item.pixDiscountPercent} onChange={(pixDiscountPercent) => set("pixDiscountPercent", pixDiscountPercent)} />
        <NumberField label="Kit (%)" value={item.kitDiscountPercent} onChange={(kitDiscountPercent) => set("kitDiscountPercent", kitDiscountPercent)} />
        <NumberField label="Assinatura (%)" value={item.subscriptionDefaultPercent} onChange={(subscriptionDefaultPercent) => set("subscriptionDefaultPercent", subscriptionDefaultPercent)} />
        <NumberField label="Pontos de quem indica" value={item.referrerPoints} onChange={(referrerPoints) => set("referrerPoints", referrerPoints)} />
        <NumberField label="Pontos de quem foi indicado" value={item.referredPoints} onChange={(referredPoints) => set("referredPoints", referredPoints)} />
      </div>
      {item.levels.map((level, index) => (
        <Section key={level.id} title={level.name}>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Nome"><Input aria-label={`Nome ${level.id}`} value={level.name} onChange={(event) => set("levels", item.levels.map((entry, entryIndex) => entryIndex === index ? { ...entry, name: event.target.value } : entry))} /></Field>
            <NumberField label="Pontos mínimos" value={level.minPoints} onChange={(minPoints) => set("levels", item.levels.map((entry, entryIndex) => entryIndex === index ? { ...entry, minPoints } : entry))} />
            <NumberField label="Multiplicador" value={level.multiplier} onChange={(multiplier) => set("levels", item.levels.map((entry, entryIndex) => entryIndex === index ? { ...entry, multiplier } : entry))} />
          </div>
          <TextArea label="Vantagens (uma por linha)" value={level.perks.join("\n")} onChange={(value) => set("levels", item.levels.map((entry, entryIndex) => entryIndex === index ? { ...entry, perks: value.split("\n").map((line) => line.trim()).filter(Boolean) } : entry))} />
        </Section>
      ))}
      <Button type="button" className="rounded-full" onClick={() => void save()}>Salvar</Button>
      <p className="text-xs text-muted-foreground">Frete grátis de referência: {formatBRL(item.freeShippingCents)}.</p>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <Field label={label}>
      <Input aria-label={label} type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </Field>
  );
}

export function OrdersScreen() {
  return (
    <div className="mx-auto max-w-5xl">
      <CollectionScreen<AdminOrder>
        eyebrow="Operação"
        title="Pedidos"
        description="Status e rastreio. O pagamento deste protótipo continua simulado."
        resource="orders"
        removeLabel=""
        editHref={(item) => `/admin/pedidos/${item.id}`}
        columns={[
          { header: "Código", cell: (item) => item.code },
          { header: "E-mail", cell: (item) => item.email },
          { header: "Total", cell: (item) => formatBRL(item.totalCents) },
          { header: "Status", cell: (item) => <StatusPill status={item.status} /> },
        ]}
      />
    </div>
  );
}

export function CustomersScreen() {
  return (
    <div className="mx-auto max-w-5xl">
      <CollectionScreen<AdminCustomer>
        eyebrow="Operação"
        title="Clientes"
        description="Saldo, pontos acumulados e assinatura vão no PATCH /customers/:id."
        resource="customers"
        removeLabel=""
        saveDraft={async (draft) => {
          await adminFetch(`customers/${encodeURIComponent(draft.id)}`, {
            method: "PATCH",
            body: JSON.stringify({
              pointsBalance: Math.trunc(draft.pointsBalance),
              pointsLifetime: Math.trunc(draft.pointsLifetime),
              marketingOptIn: draft.marketingOptIn,
              subscriptions: draft.subscriptions.map((item) => ({ id: item.id, status: item.status })),
            }),
          });
        }}
        columns={[
          { header: "Nome", cell: (item) => item.name },
          { header: "E-mail", cell: (item) => item.email },
          { header: "CPF", cell: (item) => item.cpfMasked ?? "—" },
          { header: "Pontos", cell: (item) => item.pointsBalance },
        ]}
        renderEditor={(draft, update) => (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Pontos na conta"><Input aria-label="Pontos na conta" type="number" min={0} value={draft.pointsBalance} onChange={(event) => update({ pointsBalance: Number(event.target.value) })} /></Field>
              <Field label="Pontos acumulados"><Input aria-label="Pontos acumulados" type="number" min={0} value={draft.pointsLifetime} onChange={(event) => update({ pointsLifetime: Number(event.target.value) })} /></Field>
            </div>
            {draft.subscriptions.map((subscription) => (
              <SelectField key={subscription.id} label={subscription.name} value={subscription.status} onChange={(status) => update({ subscriptions: draft.subscriptions.map((item) => item.id === subscription.id ? { ...item, status: status as AdminCustomer["subscriptions"][number]["status"] } : item) })}>
                <option value="ativa">Ativa</option>
                <option value="pausada">Pausada</option>
                <option value="cancelada">Cancelada</option>
              </SelectField>
            ))}
            {draft.subscriptions.length === 0 ? <p className="text-sm text-muted-foreground">Sem assinatura.</p> : null}
          </div>
        )}
      />
    </div>
  );
}

export function BannersScreen() {
  const fields: FieldSpec<AdminBanner>[] = [
    { kind: "text", key: "title", label: "Título" },
    { kind: "text", key: "subtitle", label: "Subtítulo" },
    { kind: "select", key: "slot", label: "Lugar", options: [{ value: "hero", label: "Hero" }, { value: "marquee", label: "Faixa" }, { value: "destaque", label: "Destaque" }] },
    { kind: "text", key: "href", label: "Link", hint: "https:// ou um caminho que começa com /." },
    { kind: "text", key: "imageUrl", label: "Imagem (https)" },
    { kind: "text", key: "accent", label: "Cor (#hex)" },
    { kind: "number", key: "position", label: "Ordem" },
    { kind: "check", key: "active", label: "Ativo" },
  ];
  return (
    <div className="mx-auto max-w-5xl">
      <CollectionScreen
        eyebrow="Home"
        title="Vitrine"
        description="Hero, faixa e destaques. A home lê GET /v1/banners. Criar é POST. Editar é PATCH /banners/:id."
        resource="banners"
        rowKey={(item) => item.id}
        write="post"
        validate={(draft) => bannerHrefError(draft.href)}
        blank={(): AdminBanner => ({ id: "", slot: "destaque", title: "", subtitle: "", href: "/", imageUrl: null, accent: "#d6ff3c", position: 0, active: true, startsAt: null, endsAt: null })}
        fields={fields}
        columns={[
          { header: "Título", cell: (item) => <BannerLink href={item.href}>{item.title}</BannerLink> },
          { header: "Lugar", cell: (item) => item.slot },
          { header: "Estado", cell: (item) => <StatusPill status={item.active ? "ativo" : "oculto"} /> },
        ]}
      />
    </div>
  );
}
