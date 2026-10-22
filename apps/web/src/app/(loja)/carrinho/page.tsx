"use client";

import { Pack } from "@/components/brand/pack";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/config";
import { usePulso } from "@/lib/store";
import { formatBRL, freeShippingProgress } from "@pulso/domain";
import Link from "next/link";

export default function CartPage() {
  const hydrated = usePulso((state) => state.hydrated);
  const cart = usePulso((state) => state.cart);
  const setQuantity = usePulso((state) => state.setQuantity);
  const lines = hydrated ? cart : [];
  const merchandise = lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  const progress = freeShippingProgress(merchandise, siteConfig.freeShippingCents);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-7xl leading-none">Sacola</h1>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-lime" style={{ width: `${progress.ratio * 100}%` }} /></div>
      <p className="mt-2 text-sm text-muted-foreground">{progress.reached ? "Frete PAC liberado." : `Faltam ${formatBRL(progress.remainingCents)} pro frete grátis.`}</p>
      <ul className="mt-6 space-y-4">
        {lines.length === 0 ? <li>Nada aqui. <Link href="/loja" className="text-lime">Bora pra loja.</Link></li> : null}
        {lines.map((line) => (
          <li key={line.lineId} className="flex gap-3 rounded-2xl border border-white/10 p-3">
            <div className="w-16"><Pack line={line.name} flavor={line.flavorName} hex={line.hex} /></div>
            <div className="flex-1">
              <p className="font-display text-3xl leading-none">{line.name}</p>
              <p className="text-sm text-muted-foreground">{line.flavorName} · {line.size}{line.subscription ? " · assinatura" : ""}</p>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" aria-label="Diminuir" onClick={() => setQuantity(line.lineId, line.quantity - 1)} className="size-8 rounded-full border border-white/15">-</button>
                <span>{line.quantity}</span>
                <button type="button" aria-label="Aumentar" onClick={() => setQuantity(line.lineId, line.quantity + 1)} className="size-8 rounded-full border border-white/15">+</button>
                <span className="ml-auto">{formatBRL(line.unitPriceCents * line.quantity)}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <Button className="mt-6 h-12 rounded-full" asChild><Link href="/checkout">Ir pro checkout</Link></Button>
    </div>
  );
}
