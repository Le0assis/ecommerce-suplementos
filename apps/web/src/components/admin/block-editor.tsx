"use client";

import { ArticleBlocks, type ArticleProduct } from "@/components/content/article-blocks";
import { Field, ImageUrlField, SelectField, TextArea } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch } from "@/lib/admin-fetch";
import type { AdminList, AdminPostBlock, AdminProduct } from "@/lib/admin-types";
import { readyBlocks } from "@/lib/post-blocks";
import { useEffect, useState } from "react";

const KINDS: { id: AdminPostBlock["type"]; label: string }[] = [
  { id: "paragrafo", label: "Parágrafo" },
  { id: "titulo", label: "Subtítulo" },
  { id: "imagem", label: "Imagem" },
  { id: "citacao_lateral", label: "Citação" },
  { id: "produto", label: "Produto" },
];

export function BlockEditor({ blocks, onChange }: { blocks: AdminPostBlock[]; onChange: (blocks: AdminPostBlock[]) => void }) {
  const [products, setProducts] = useState<ArticleProduct[]>([]);
  const [preview, setPreview] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await adminFetch<AdminList<AdminProduct>>("products?status=ativos&pageSize=100");
        if (cancelled) return;
        setProducts(list.items.map((product) => ({
          id: product.id,
          slug: product.slug,
          name: product.name,
          line: product.line,
          hex: product.flavors[0]?.hex ?? "#d6ff3c",
        })));
      } catch {
        if (!cancelled) setProducts([]);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function update(index: number, block: AdminPostBlock) {
    onChange(blocks.map((item, itemIndex) => (itemIndex === index ? block : item)));
  }

  function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= blocks.length) return;
    const copy = [...blocks];
    const [item] = copy.splice(index, 1);
    if (!item) return;
    copy.splice(next, 0, item);
    onChange(copy);
  }

  function add(type: AdminPostBlock["type"]) {
    const id = crypto.randomUUID();
    const block: AdminPostBlock =
      type === "imagem"
        ? { id, type, url: "", alt: "", caption: "" }
        : type === "citacao_lateral"
          ? { id, type, text: "", side: "esquerda" }
          : type === "produto"
            ? { id, type, productId: products[0]?.id ?? "" }
            : { id, type, text: "" };
    onChange([...blocks, block]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {KINDS.map((kind) => (
          <Button key={kind.id} type="button" variant="outline" className="rounded-full" onClick={() => add(kind.id)}>{kind.label}</Button>
        ))}
        <Button type="button" variant="outline" className="rounded-full" onClick={() => setPreview((value) => !value)}>{preview ? "Esconder prévia" : "Ver prévia"}</Button>
      </div>
      {blocks.map((block, index) => (
        <div key={block.id} className="rounded-[1.2rem] border border-white/10 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-lime">{KINDS.find((kind) => kind.id === block.type)?.label}</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => move(index, -1)}>Subir</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => move(index, 1)}>Descer</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => onChange(blocks.filter((_, itemIndex) => itemIndex !== index))}>Remover</Button>
            </div>
          </div>
          {block.type === "paragrafo" || block.type === "titulo" ? (
            <TextArea label="Texto" value={block.text} onChange={(text) => update(index, { ...block, text })} rows={block.type === "titulo" ? 2 : 5} />
          ) : null}
          {block.type === "citacao_lateral" ? (
            <div className="grid gap-3 md:grid-cols-[1fr_12rem]">
              <TextArea label="Citação" value={block.text} onChange={(text) => update(index, { ...block, text })} rows={3} />
              <SelectField label="Lado" value={block.side} onChange={(side) => update(index, { ...block, side: side === "direita" ? "direita" : "esquerda" })}>
                <option value="esquerda">Esquerda</option>
                <option value="direita">Direita</option>
              </SelectField>
            </div>
          ) : null}
          {block.type === "imagem" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Texto alternativo"><Input aria-label={`Texto alternativo do bloco ${index + 1}`} value={block.alt} onChange={(event) => update(index, { ...block, alt: event.target.value })} /></Field>
              <Field label="Legenda"><Input aria-label={`Legenda do bloco ${index + 1}`} value={block.caption} onChange={(event) => update(index, { ...block, caption: event.target.value })} /></Field>
              <ImageUrlField label="Imagem" url={block.url} alt={block.alt} onChange={(url) => update(index, { ...block, url })} />
            </div>
          ) : null}
          {block.type === "produto" ? (
            <SelectField label="Produto" value={block.productId} onChange={(productId) => update(index, { ...block, productId })}>
              <option value="">Escolher</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </SelectField>
          ) : null}
        </div>
      ))}
      {preview ? (
        <div className="rounded-[1.4rem] border border-dashed border-white/15 p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Pré-visualização</p>
          <ArticleBlocks blocks={readyBlocks(blocks)} products={products} />
        </div>
      ) : null}
    </div>
  );
}
