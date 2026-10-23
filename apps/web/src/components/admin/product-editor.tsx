"use client";

import { CheckRow, Field, MoneyField, Notice, Section, SelectField, TextArea } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch, AdminApiError, uploadAdminImage } from "@/lib/admin-fetch";
import { omitEmptyIds, uniqueSlug } from "@/lib/admin-payload";
import { safePreview } from "@/lib/admin-preview";
import { blankProduct, PRODUCT_STATUSES, slugify, type AdminFlavor, type AdminImage, type AdminInfluencerRef, type AdminList, type AdminOne, type AdminProduct, type AdminVariant } from "@/lib/admin-types";
import { CATEGORIES, GOALS, type FlavorFamily } from "@pulso/domain";

const BADGE_OPTIONS = ["drop", "limited", "bestseller", "novo", "collab"] as const;
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

const FAMILIES: { id: FlavorFamily; label: string }[] = [
  { id: "citrica", label: "Cítrica" },
  { id: "doce", label: "Doce" },
  { id: "fruta", label: "Fruta" },
  { id: "neutro", label: "Neutro" },
  { id: "chocolate", label: "Chocolate" },
];

export function ProductEditor({ productId }: { productId: string }) {
  const isNew = productId === "novo";
  const router = useRouter();
  const [product, setProduct] = useState<AdminProduct | null>(isNew ? blankProduct() : null);
  const [influencers, setInfluencers] = useState<AdminInfluencerRef[]>([]);
  const [catalog, setCatalog] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [slugEdited, setSlugEdited] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [people, list] = await Promise.all([
          adminFetch<AdminList<AdminInfluencerRef>>("influencers"),
          adminFetch<AdminList<AdminProduct>>("products?status=todos&pageSize=100"),
        ]);
        if (cancelled) return;
        setInfluencers(people.items);
        setCatalog(list.items.map((item) => ({ id: item.id, name: item.name, slug: item.slug })));
        if (!isNew) {
          const one = await adminFetch<AdminOne<AdminProduct>>(`products/${productId}`);
          if (!cancelled) setProduct(one.item);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof AdminApiError ? caught.message : "Não deu para abrir o produto.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [isNew, productId]);

  function update(partial: Partial<AdminProduct>) {
    setProduct((current) => (current ? { ...current, ...partial } : current));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product) return;
    const taken = catalog.map((item) => item.slug);
    const slug = isNew || !product.id ? uniqueSlug(product.slug || product.name, taken) : slugify(product.slug || product.name);
    const payload = omitEmptyIds({
      ...product,
      id: isNew ? "" : product.id,
      slug,
      images: product.images
        .filter((image) => (image.url ?? "").trim() || image.alt.trim())
        .map((image) => ({ ...image, url: (image.url ?? "").trim() || null })),
      label: { ...product.label, nutrition: product.label.nutrition.filter((row) => row.nutrient.trim() && row.amount.trim()) },
      kitItems: product.isKit ? product.kitItems.filter((item) => item.productId) : product.kitItems,
    });
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (isNew || !product.id) {
        const created = await adminFetch<AdminOne<AdminProduct>>("products", { method: "POST", body: JSON.stringify(payload) });
        router.push(`/admin/produtos/${created.item.id}`);
        router.refresh();
        return;
      }
      const saved = await adminFetch<AdminOne<AdminProduct>>(`products/${product.id}`, { method: "PATCH", body: JSON.stringify({ ...product, slug, images: payload.images, label: payload.label, kitItems: payload.kitItems }) });
      setProduct(saved.item);
      setNotice("Salvo.");
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "Não deu para salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!product?.id) return;
    setSaving(true);
    try {
      await adminFetch(`products/${product.id}`, { method: "DELETE" });
      router.push("/admin/produtos");
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : "Não deu para arquivar.");
      setSaving(false);
    }
  }

  if (!product) {
    return error ? <Notice tone="error">{error}</Notice> : <p className="text-sm text-muted-foreground">Carregando produto…</p>;
  }

  const others = catalog.filter((item) => item.id !== product.id);

  return (
    <form className="mx-auto max-w-5xl space-y-4" onSubmit={(event) => void save(event)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin/produtos" className="text-xs font-bold uppercase tracking-[0.16em] text-lime">Produtos</Link>
          <h1 className="font-display text-6xl leading-none">{isNew ? "Novo produto" : product.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {product.id ? <Button type="button" variant="outline" disabled={saving} onClick={() => void archive()}>Arquivar</Button> : null}
          <Button type="submit" className="rounded-full" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </div>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="ok">{notice}</Notice> : null}
      <p className="text-sm text-muted-foreground">Registro fictício, no padrão NI-DEMO. Sem promessa de saúde, sem número de ANVISA real.</p>

      <Section title="Dados">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Nome">
            <Input
              aria-label="Nome"
              value={product.name}
              onChange={(event) => {
                const name = event.target.value;
                const taken = catalog.map((item) => item.slug);
                setProduct((current) => {
                  if (!current) return current;
                  if (slugEdited) return { ...current, name };
                  return { ...current, name, slug: uniqueSlug(name, taken, current.id ? current.slug : undefined) };
                });
              }}
              required
            />
          </Field>
          <Field label="Slug" hint="A URL da loja. Minúsculas e hífen, sem colar o nome.">
            <Input
              aria-label="Slug"
              value={product.slug}
              onChange={(event) => {
                setSlugEdited(true);
                update({ slug: slugify(event.target.value) });
              }}
              required
            />
          </Field>
          <Field label="Linha">
            <Input aria-label="Linha" value={product.line} onChange={(event) => update({ line: event.target.value })} />
          </Field>
          <Field label="Frase curta">
            <Input aria-label="Frase curta" value={product.tagline} onChange={(event) => update({ tagline: event.target.value })} />
          </Field>
          <SelectField label="Categoria" value={String(product.categoryId)} onChange={(categoryId) => update({ categoryId })}>
            {CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
          </SelectField>
          <SelectField label="Status" value={product.status} onChange={(status) => update({ status: status as AdminProduct["status"] })}>
            {PRODUCT_STATUSES.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
          </SelectField>
          <SelectField label="Influencer" value={product.influencerId ?? ""} onChange={(value) => update({ influencerId: value || null })}>
            <option value="">Nenhum</option>
            {influencers.map((influencer) => <option key={influencer.id} value={influencer.id}>{influencer.name}</option>)}
          </SelectField>
          <Field label="Cafeína (mg)">
            <Input aria-label="Cafeína em mg" inputMode="numeric" value={String(product.caffeineMg)} onChange={(event) => update({ caffeineMg: Math.max(0, Number(event.target.value) || 0) })} />
          </Field>
          <Field label="Proteína por porção (g)">
            <Input aria-label="Proteína por porção" inputMode="numeric" value={String(product.proteinG)} onChange={(event) => update({ proteinG: Math.max(0, Number(event.target.value) || 0) })} />
          </Field>
        </div>
        <TextArea label="Descrição" value={product.description} onChange={(description) => update({ description })} />
        <TextArea label="Como usar" value={product.howToUse} onChange={(howToUse) => update({ howToUse })} rows={3} />
        <div className="flex flex-wrap gap-4">
          <CheckRow label="Assinatura ligada" checked={product.subscriptionEnabled} onChange={(subscriptionEnabled) => update({ subscriptionEnabled })} />
          <Field label="Desconto da assinatura (%)">
            <Input aria-label="Desconto da assinatura" inputMode="numeric" value={String(product.subscriptionPercent)} onChange={(event) => update({ subscriptionPercent: Math.min(30, Math.max(0, Number(event.target.value) || 0)) })} />
          </Field>
          <Field label="Intervalo (dias)">
            <Input aria-label="Intervalo da assinatura" inputMode="numeric" value={String(product.subscriptionIntervalDays)} onChange={(event) => update({ subscriptionIntervalDays: Math.max(1, Number(event.target.value) || 1) })} />
          </Field>
        </div>
      </Section>

      <Section title="Objetivos e selos">
        <div className="flex flex-wrap gap-3">
          {GOALS.map((goal) => (
            <CheckRow
              key={goal.id}
              label={goal.label}
              checked={product.goals.includes(goal.id)}
              onChange={(checked) => update({ goals: checked ? [...product.goals, goal.id] : product.goals.filter((item) => item !== goal.id) })}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          {BADGE_OPTIONS.map((badge) => (
            <CheckRow
              key={badge}
              label={badge}
              checked={product.badges.includes(badge)}
              onChange={(checked) => update({ badges: checked ? [...product.badges, badge] : product.badges.filter((item) => item !== badge) })}
            />
          ))}
        </div>
      </Section>

      <Section
        title="Sabores"
        action={<Button type="button" size="sm" variant="outline" onClick={() => update({ flavors: [...product.flavors, newFlavor(product.flavors)] })}>Adicionar sabor</Button>}
      >
        {product.flavors.length === 0 ? <p className="text-sm text-muted-foreground">Sem sabor ainda. A cor segura o lugar da foto.</p> : null}
        {product.flavors.map((flavor) => (
          <div key={flavor.id} className="grid gap-2 rounded-2xl border border-white/10 p-3 md:grid-cols-6">
            <div className="h-9 rounded-md border border-white/10" style={{ background: flavor.hex }} aria-hidden="true" />
            <Field label="Nome"><Input aria-label={`Nome do sabor ${flavor.name}`} value={flavor.name} onChange={(event) => update({ flavors: mapFlavor(product.flavors, flavor.id, { name: event.target.value }) })} /></Field>
            <Field label="Frase"><Input aria-label={`Frase do sabor ${flavor.name}`} value={flavor.tagline} onChange={(event) => update({ flavors: mapFlavor(product.flavors, flavor.id, { tagline: event.target.value }) })} /></Field>
            <Field label="Cor"><Input aria-label={`Cor do sabor ${flavor.name}`} value={flavor.hex} onChange={(event) => update({ flavors: mapFlavor(product.flavors, flavor.id, { hex: event.target.value }) })} /></Field>
            <SelectField label="Família" value={flavor.family} onChange={(family) => update({ flavors: mapFlavor(product.flavors, flavor.id, { family: family as FlavorFamily }) })}>
              {FAMILIES.map((family) => <option key={family.id} value={family.id}>{family.label}</option>)}
            </SelectField>
            <Field label="Estoque"><Input aria-label={`Estoque do sabor ${flavor.name}`} inputMode="numeric" value={String(flavor.stock)} onChange={(event) => update({ flavors: mapFlavor(product.flavors, flavor.id, { stock: Math.max(0, Number(event.target.value) || 0) }) })} /></Field>
            <div className="flex items-end justify-between gap-2 md:col-span-6">
              <CheckRow label="Edição limitada" checked={flavor.limited} onChange={(limited) => update({ flavors: mapFlavor(product.flavors, flavor.id, { limited }) })} />
              <Button type="button" size="sm" variant="outline" onClick={() => update({ flavors: product.flavors.filter((item) => item.id !== flavor.id), variants: product.variants.filter((item) => item.flavorId !== flavor.id) })}>Remover</Button>
            </div>
          </div>
        ))}
      </Section>

      <Section
        title="Tamanhos, SKU e preço"
        action={<Button type="button" size="sm" variant="outline" onClick={() => { if (!product.flavors.length) { setError("Crie um sabor antes da variante."); return; } setError(null); update({ variants: [...product.variants, newVariant(product)] }); }}>Adicionar variante</Button>}
      >
        <p className="text-xs text-muted-foreground">Preço em reais. O servidor guarda centavos. O estoque da variante é o do lote daquele tamanho.</p>
        {product.variants.map((variant) => (
          <div key={variant.id} className="grid gap-2 rounded-2xl border border-white/10 p-3 md:grid-cols-4">
            <SelectField label="Sabor" value={variant.flavorId} onChange={(flavorId) => update({ variants: mapVariant(product.variants, variant.id, { flavorId }) })}>
              {product.flavors.map((flavor) => <option key={flavor.id} value={flavor.id}>{flavor.name}</option>)}
            </SelectField>
            <Field label="Tamanho"><Input aria-label={`Tamanho ${variant.sku}`} value={variant.size} onChange={(event) => update({ variants: mapVariant(product.variants, variant.id, { size: event.target.value }) })} /></Field>
            <Field label="SKU"><Input aria-label={`SKU ${variant.sku}`} value={variant.sku} onChange={(event) => update({ variants: mapVariant(product.variants, variant.id, { sku: event.target.value.toUpperCase() }) })} /></Field>
            <Field label="Estoque"><Input aria-label={`Estoque ${variant.sku}`} inputMode="numeric" value={String(variant.stock)} onChange={(event) => update({ variants: mapVariant(product.variants, variant.id, { stock: Math.max(0, Number(event.target.value) || 0) }) })} /></Field>
            <MoneyField key={`${variant.id}-price-${variant.priceCents}`} label="Preço" cents={variant.priceCents} onChange={(priceCents) => update({ variants: mapVariant(product.variants, variant.id, { priceCents }) })} />
            <MoneyField key={`${variant.id}-compare-${variant.compareAtCents ?? 0}`} label="Preço riscado" cents={variant.compareAtCents ?? 0} onChange={(compareAtCents) => update({ variants: mapVariant(product.variants, variant.id, { compareAtCents: compareAtCents || null }) })} />
            <Field label="Peso (g)"><Input aria-label={`Peso ${variant.sku}`} inputMode="numeric" value={String(variant.weightGrams)} onChange={(event) => update({ variants: mapVariant(product.variants, variant.id, { weightGrams: Math.max(0, Number(event.target.value) || 0) }) })} /></Field>
            <Field label="Porções"><Input aria-label={`Porções ${variant.sku}`} inputMode="numeric" value={String(variant.servings)} onChange={(event) => update({ variants: mapVariant(product.variants, variant.id, { servings: Math.max(1, Number(event.target.value) || 1) }) })} /></Field>
            <div className="md:col-span-4"><Button type="button" size="sm" variant="outline" onClick={() => update({ variants: product.variants.filter((item) => item.id !== variant.id) })}>Remover variante</Button></div>
          </div>
        ))}
      </Section>

      <Section title="Rótulo">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Registro demo"><Input aria-label="Registro" value={product.label.registration} onChange={(event) => update({ label: { ...product.label, registration: event.target.value } })} /></Field>
          <Field label="Porção"><Input aria-label="Porção" value={product.label.serving} onChange={(event) => update({ label: { ...product.label, serving: event.target.value } })} /></Field>
          <Field label="Porções por pote"><Input aria-label="Porções por pote" inputMode="numeric" value={String(product.label.servingsPerContainer)} onChange={(event) => update({ label: { ...product.label, servingsPerContainer: Math.max(0, Number(event.target.value) || 0) } })} /></Field>
          <Field label="Fabricante"><Input aria-label="Fabricante" value={product.label.manufacturer} onChange={(event) => update({ label: { ...product.label, manufacturer: event.target.value } })} /></Field>
        </div>
        <TextArea label="Ingredientes" value={product.label.ingredients} onChange={(ingredients) => update({ label: { ...product.label, ingredients } })} />
        <TextArea label="Alergênicos" value={product.label.allergens} onChange={(allergens) => update({ label: { ...product.label, allergens } })} rows={2} />
        <TextArea label="Advertências, uma por linha" value={product.label.warnings.join("\n")} onChange={(value) => update({ label: { ...product.label, warnings: value.split("\n").map((item) => item.trim()).filter(Boolean) } })} />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Tabela nutricional</p>
            <Button type="button" size="sm" variant="outline" onClick={() => update({ label: { ...product.label, nutrition: [...product.label.nutrition, { nutrient: "", amount: "", dailyValue: "" }] } })}>Linha</Button>
          </div>
          {product.label.nutrition.map((row, index) => (
            <div key={`${row.nutrient}-${index}`} className="grid gap-2 md:grid-cols-[1fr_1fr_8rem_auto]">
              <Input aria-label={`Nutriente ${index + 1}`} placeholder="Nutriente" value={row.nutrient} onChange={(event) => update({ label: { ...product.label, nutrition: product.label.nutrition.map((item, itemIndex) => itemIndex === index ? { ...item, nutrient: event.target.value } : item) } })} />
              <Input aria-label={`Quantidade ${index + 1}`} placeholder="Quantidade" value={row.amount} onChange={(event) => update({ label: { ...product.label, nutrition: product.label.nutrition.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value } : item) } })} />
              <Input aria-label={`Valor diário ${index + 1}`} placeholder="%VD" value={row.dailyValue} onChange={(event) => update({ label: { ...product.label, nutrition: product.label.nutrition.map((item, itemIndex) => itemIndex === index ? { ...item, dailyValue: event.target.value } : item) } })} />
              <Button type="button" size="sm" variant="outline" onClick={() => update({ label: { ...product.label, nutrition: product.label.nutrition.filter((_, itemIndex) => itemIndex !== index) } })}>Tirar</Button>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Fotos"
        action={<Button type="button" size="sm" variant="outline" onClick={() => update({ images: [...product.images, newImage(product.images)] })}>Adicionar foto</Button>}
      >
        <p className="text-xs text-muted-foreground">Texto alternativo é obrigatório. A foto sobe pelo endereço que a API devolver. Sem URL, fica a cor do sabor.</p>
        {product.images.map((image) => {
          const hex = product.flavors.find((flavor) => flavor.id === image.flavorId)?.hex ?? product.flavors[0]?.hex ?? "#141418";
          return (
            <div key={image.id} className="grid gap-2 rounded-2xl border border-white/10 p-3 md:grid-cols-[4rem_1fr_1fr]">
              <div className="h-16 rounded-lg border border-white/10" style={{ background: safePreview(image.url, hex) }} role="img" aria-label={image.alt || "Prévia da foto"} />
              <Field label="URL"><Input aria-label={`URL da foto ${image.alt || image.id}`} value={image.url ?? ""} onChange={(event) => update({ images: mapImage(product.images, image.id, { url: event.target.value || null }) })} /></Field>
              <Field label="Texto alternativo"><Input aria-label={`Texto alternativo ${image.id}`} value={image.alt} onChange={(event) => update({ images: mapImage(product.images, image.id, { alt: event.target.value }) })} /></Field>
              <SelectField label="Sabor" value={image.flavorId ?? ""} onChange={(value) => update({ images: mapImage(product.images, image.id, { flavorId: value || null }) })}>
                <option value="">Produto</option>
                {product.flavors.map((flavor) => <option key={flavor.id} value={flavor.id}>{flavor.name}</option>)}
              </SelectField>
              <Field label="Arquivo">
                <Input
                  aria-label={`Arquivo da foto ${image.id}`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void uploadAdminImage(file, image.alt).then((uploaded) => {
                      update({ images: mapImage(product.images, image.id, { url: uploaded.url, alt: image.alt }) });
                      setNotice("Foto enviada.");
                    }).catch((caught: unknown) => {
                      setError(caught instanceof AdminApiError ? caught.message : "Não deu para enviar a foto.");
                    });
                  }}
                />
              </Field>
              <div className="flex items-end justify-between gap-2">
                <CheckRow label="Capa" checked={image.isCover} onChange={(isCover) => update({ images: product.images.map((item) => ({ ...item, isCover: item.id === image.id ? isCover : isCover ? false : item.isCover })) })} />
                <Button type="button" size="sm" variant="outline" onClick={() => update({ images: product.images.filter((item) => item.id !== image.id) })}>Remover</Button>
              </div>
            </div>
          );
        })}
      </Section>

      <Section title="Kit">
        <CheckRow label="Este produto é um kit" checked={product.isKit} onChange={(isKit) => update({ isKit })} />
        {product.isKit ? (
          <div className="space-y-2">
            {product.kitItems.map((item, index) => (
              <div key={`${item.productId}-${index}`} className="grid gap-2 md:grid-cols-[1fr_8rem_auto]">
                <SelectField label="Produto" value={item.productId} onChange={(productId) => update({ kitItems: product.kitItems.map((kitItem, itemIndex) => itemIndex === index ? { ...kitItem, productId } : kitItem) })}>
                  <option value="">Escolher</option>
                  {others.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </SelectField>
                <Field label="Quantidade"><Input aria-label={`Quantidade do item ${index + 1}`} inputMode="numeric" value={String(item.quantity)} onChange={(event) => update({ kitItems: product.kitItems.map((kitItem, itemIndex) => itemIndex === index ? { ...kitItem, quantity: Math.max(1, Number(event.target.value) || 1) } : kitItem) })} /></Field>
                <div className="flex items-end"><Button type="button" size="sm" variant="outline" onClick={() => update({ kitItems: product.kitItems.filter((_, itemIndex) => itemIndex !== index) })}>Tirar</Button></div>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => update({ kitItems: [...product.kitItems, { productId: others[0]?.id ?? "", quantity: 1 }] })}>Adicionar item</Button>
          </div>
        ) : null}
      </Section>
    </form>
  );
}

function mapFlavor(flavors: AdminFlavor[], id: string, partial: Partial<AdminFlavor>): AdminFlavor[] {
  return flavors.map((item) => (item.id === id ? { ...item, ...partial } : item));
}

function mapVariant(variants: AdminVariant[], id: string, partial: Partial<AdminVariant>): AdminVariant[] {
  return variants.map((item) => (item.id === id ? { ...item, ...partial } : item));
}

function mapImage(images: AdminImage[], id: string, partial: Partial<AdminImage>): AdminImage[] {
  return images.map((item) => (item.id === id ? { ...item, ...partial } : item));
}

function nextId(prefix: string, used: string[]): string {
  let n = used.length + 1;
  let id = `${prefix}-${n}`;
  while (used.includes(id)) {
    n += 1;
    id = `${prefix}-${n}`;
  }
  return id;
}

function newFlavor(flavors: AdminFlavor[]): AdminFlavor {
  return { id: nextId("sabor", flavors.map((item) => item.id)), name: "Novo sabor", tagline: "", hex: "#d6ff3c", family: "fruta", limited: false, stock: 0 };
}

function newVariant(product: AdminProduct): AdminVariant {
  const flavor = product.flavors[0];
  const id = nextId("var", product.variants.map((item) => item.id));
  const flavorId = flavor?.id ?? "sabor";
  const sku = `PL-${(product.slug || "NOVO").toUpperCase()}-${id}`.replace(/[^A-Z0-9-]/g, "").slice(0, 48);
  return { id, flavorId, size: "30 doses", sku, priceCents: 0, compareAtCents: null, stock: flavor?.stock ?? 0, weightGrams: 300, servings: 30 };
}

function newImage(images: AdminImage[]): AdminImage {
  return { id: nextId("foto", images.map((item) => item.id)), flavorId: null, url: null, alt: "", position: images.length, isCover: images.length === 0 };
}
