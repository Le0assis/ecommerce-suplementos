"use client";

import { Countdown } from "@/components/gamification/countdown";
import { Pack } from "@/components/brand/pack";
import { useStoreData } from "@/components/store-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePulso } from "@/lib/store";
import Link from "next/link";
import { useState } from "react";

export default function DropsPage() {
  const { products, upcomingDrop } = useStoreData();
  const join = usePulso((state) => state.joinNewsletter);
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const drops = products.filter((product) => product.drop);
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-pink">Edição curta</p>
      <h1 className="font-display text-7xl leading-[0.85]">Drops</h1>
      <div className="mt-8 grid gap-4">
        {drops.map((product) => {
          const flavor = product.flavors.find((item) => item.limited) ?? product.flavors[0];
          if (!flavor || !product.drop) return null;
          return (
            <article key={product.slug} className="grid items-center gap-4 rounded-[1.6rem] border border-white/10 p-4 sm:grid-cols-[8rem_1fr_auto]">
              <Pack line={product.line} flavor={flavor.name} hex={flavor.hex} badge={product.drop.edition} />
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-pink">{product.drop.edition} · {product.drop.unitsLeft} un. no lote</p>
                <h2 className="font-display text-5xl leading-none">{product.name}</h2>
                <p className="text-sm text-muted-foreground">{flavor.name}. {flavor.tagline}</p>
                <Countdown endsAt={product.drop.endsAt} />
              </div>
              <Button asChild className="rounded-full"><Link href={`/loja/${product.slug}?sabor=${flavor.id}`}>Garantir</Link></Button>
            </article>
          );
        })}
      </div>
      <form
        className="mt-8 rounded-[1.6rem] bg-white/5 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          join(email.trim().toLowerCase());
          setDone(true);
        }}
      >
        <h2 className="font-display text-5xl">{upcomingDrop.edition}</h2>
        <p className="text-sm text-muted-foreground">{upcomingDrop.note}</p>
        <Countdown endsAt={upcomingDrop.endsAt} />
        <div className="mt-3 flex gap-2">
          <Input type="email" required aria-label="E-mail da lista" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="seu@email.com" />
          <Button type="submit">Quero saber</Button>
        </div>
        {done ? <p className="mt-2 text-sm text-lime">Anotado neste navegador.</p> : null}
      </form>
    </div>
  );
}
