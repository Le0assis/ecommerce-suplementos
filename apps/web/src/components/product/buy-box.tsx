"use client";

import { Pack } from "@/components/brand/pack";
import { SupplementNotice } from "@/components/product/supplement-notice";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/config";
import { usePulso } from "@/lib/store";
import { useStoreData } from "@/components/store-data";
import type { CatalogProduct } from "@pulso/data";
import { formatBRL } from "@pulso/domain";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

export function BuyBox({ product: initial }: { product: CatalogProduct }) {
  const { allProducts } = useStoreData();
  const product = allProducts.find((item) => item.slug === initial.slug) ?? initial;
  const params = useSearchParams();
  const flavorFromQuery = params.get("sabor") ?? product.flavors[0]?.id ?? "";
  const [flavorId, setFlavorId] = useState(flavorFromQuery);
  const [sizeId, setSizeId] = useState(product.variants.find((variant) => variant.flavorId === flavorFromQuery)?.id ?? product.variants[0]?.id ?? "");
  const [subscription, setSubscription] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const add = usePulso((state) => state.addToCart);
  const flavor = product.flavors.find((item) => item.id === flavorId) ?? product.flavors[0];
  const sizes = product.variants.filter((variant) => variant.flavorId === flavor?.id);
  const variant = sizes.find((item) => item.id === sizeId) ?? sizes[0];

  const pricing = variant
    ? (() => {
        const gross = variant.priceCents * quantity;
        const sub = subscription ? Math.round(gross * (product.subscription.discountPercent / 100)) : 0;
        const after = gross - sub;
        const pix = after - Math.round(after * (siteConfig.pixDiscountPercent / 100));
        return { gross, sub, after, pix };
      })()
    : null;

  if (!flavor || !variant || !pricing) return null;
  const soldOut = variant.stock <= 0;

  return (
    <div className="grid min-w-0 items-start gap-8 lg:grid-cols-[1.05fr_.95fr]">
      <div className="min-w-0 rounded-[2rem] border border-white/10 bg-black/50 p-4 sm:p-8 [overflow-wrap:anywhere]">
        <Pack line={product.line} flavor={flavor.name} hex={flavor.hex} badge={flavor.limited ? "limited" : product.badges[0]} className="mx-auto max-w-sm" />
        <p className="mt-4 text-center text-sm text-muted-foreground">{flavor.tagline}</p>
      </div>
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">{product.line}</p>
        <h1 className="font-display text-[clamp(4rem,10vw,7rem)] leading-[0.84]">{product.name}</h1>
        <p className="mt-3 max-w-xl text-base text-muted-foreground">{product.tagline}</p>
        <fieldset className="mt-6">
          <legend className="text-xs font-bold uppercase tracking-[0.16em]">Sabor</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {product.flavors.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setFlavorId(item.id);
                  const next = product.variants.find((variantItem) => variantItem.flavorId === item.id);
                  if (next) setSizeId(next.id);
                }}
                className={`rounded-2xl border p-3 text-left ${item.id === flavor.id ? "border-lime" : "border-white/10"}`}
                aria-pressed={item.id === flavor.id}
              >
                <span className="flex items-center gap-2">
                  <span className="size-4 rounded-full" style={{ background: item.hex }} />
                  <span className="font-semibold">{item.name}</span>
                  {item.limited ? <span className="text-[10px] uppercase tracking-[0.14em] text-pink">Drop</span> : null}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{item.stock > 0 ? `${item.stock} no estoque` : "Esgotado"}</span>
              </button>
            ))}
          </div>
        </fieldset>
        {sizes.length > 1 ? (
          <fieldset className="mt-5">
            <legend className="text-xs font-bold uppercase tracking-[0.16em]">Tamanho</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {sizes.map((item) => (
                <button key={item.id} type="button" onClick={() => setSizeId(item.id)} className={`rounded-full border px-4 py-2 text-sm ${item.id === variant.id ? "border-lime bg-lime text-primary-foreground" : "border-white/15"}`} aria-pressed={item.id === variant.id}>
                  {item.size}
                </button>
              ))}
            </div>
          </fieldset>
        ) : <p className="mt-4 text-sm text-muted-foreground">{variant.size}</p>}
        {product.subscription.enabled ? (
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 p-3">
            <input type="checkbox" checked={subscription} onChange={(event) => setSubscription(event.target.checked)} className="mt-1 accent-lime" />
            <span>
              <span className="block font-semibold">Assina e economiza {product.subscription.discountPercent}%</span>
              <span className="text-sm text-muted-foreground">Recorrência a cada {product.subscription.intervalDays} dias. Pausa quando quiser na conta.</span>
            </span>
          </label>
        ) : null}
        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <p className="font-display text-5xl leading-none">{formatBRL(pricing.after)}</p>
            <p className="text-sm text-lime">no pix {formatBRL(pricing.pix)} · {siteConfig.pixDiscountPercent}% off</p>
            {pricing.sub > 0 ? <p className="text-xs text-muted-foreground">Assinatura tira {formatBRL(pricing.sub)}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="size-10 rounded-full border border-white/15" onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Diminuir quantidade">-</button>
            <span>{quantity}</span>
            <button type="button" className="size-10 rounded-full border border-white/15" onClick={() => setQuantity((value) => value + 1)} aria-label="Aumentar quantidade">+</button>
          </div>
        </div>
        <Button
          className="mt-5 h-14 w-full rounded-full text-base uppercase tracking-[0.16em]"
          disabled={soldOut}
          onClick={() => add({
            productSlug: product.slug,
            variantId: variant.id,
            name: product.name,
            flavorName: flavor.name,
            size: variant.size,
            unitPriceCents: variant.priceCents,
            quantity,
            subscription,
            subscriptionDiscountPercent: product.subscription.discountPercent,
            category: product.category,
            hex: flavor.hex,
          })}
        >
          {soldOut ? "Esgotado" : "Adiciona na sacola"}
        </Button>
        <p className="mt-3 text-sm text-muted-foreground">{product.caffeineMg ? `${product.caffeineMg} mg de cafeína por dose.` : "Sem cafeína."}</p>
        <SupplementNotice className="mt-3" />
      </div>
    </div>
  );
}
