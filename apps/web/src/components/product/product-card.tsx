"use client";

import { Pack } from "@/components/brand/pack";
import { Button } from "@/components/ui/button";
import { usePulso, useWishlist } from "@/lib/store";
import { formatBRL, minVariantPrice, PIX_DISCOUNT_PERCENT, type Product } from "@pulso/domain";
import { Heart } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { siteConfig } from "@/lib/config";

export function ProductCard({ product }: { product: Product }) {
  const [flavorId, setFlavorId] = useState(product.flavors[0]?.id ?? "");
  const flavor = product.flavors.find((item) => item.id === flavorId) ?? product.flavors[0];
  const price = minVariantPrice(product.variants.map((variant) => variant.priceCents));
  const pix = price - Math.round(price * (siteConfig.pixDiscountPercent / 100));
  const wished = useWishlist().includes(product.slug);
  const toggle = usePulso((state) => state.toggleWishlist);
  if (!flavor) return null;
  return (
    <article className="group flex flex-col rounded-[1.6rem] border border-white/10 bg-black/40 p-3">
      <div className="relative">
        <Link href={`/loja/${product.slug}?sabor=${flavor.id}`} className="block">
          <Pack line={product.line} flavor={flavor.name} hex={flavor.hex} badge={product.badges[0]} />
        </Link>
        <button
          type="button"
          aria-pressed={wished}
          aria-label={wished ? "Remover dos favoritos" : "Salvar nos favoritos"}
          onClick={() => toggle(product.slug)}
          className={`absolute right-3 top-3 grid size-9 place-items-center rounded-full border border-white/20 bg-black/60 ${wished ? "text-pink" : "text-white"}`}
        >
          <Heart className={wished ? "fill-current" : ""} />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {product.flavors.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-label={item.name}
            onClick={() => setFlavorId(item.id)}
            className={`size-5 rounded-full border ${item.id === flavor.id ? "border-white" : "border-transparent"}`}
            style={{ background: item.hex }}
          />
        ))}
      </div>
      <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-lime">{product.line}</p>
      <h3 className="font-display text-4xl leading-none"><Link href={`/loja/${product.slug}`}>{product.name}</Link></h3>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{flavor.tagline}</p>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p>
          <span className="font-display text-3xl leading-none">{formatBRL(price)}</span>
          <span className="mt-1 block text-xs text-lime">no pix {formatBRL(pix)}</span>
        </p>
        <Button asChild className="rounded-full"><Link href={`/loja/${product.slug}?sabor=${flavor.id}`}>Quero</Link></Button>
      </div>
      <p className="sr-only">Desconto de pix de {PIX_DISCOUNT_PERCENT}% já considerado no preço em destaque secundário.</p>
    </article>
  );
}

export function Stars({ rating }: { rating: number }) {
  return (
    <p className="text-sm text-lime" aria-label={`${rating} de 5 estrelas`}>
      {"★".repeat(Math.round(rating))}{"☆".repeat(5 - Math.round(rating))} <span className="text-muted-foreground">{rating.toFixed(1)}</span>
    </p>
  );
}
