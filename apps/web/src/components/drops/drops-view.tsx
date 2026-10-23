"use client";

import { Countdown } from "@/components/gamification/countdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { scarcityOf } from "@/lib/drop-view";
import type { PublicDropView } from "@/server/public-drops";
import Link from "next/link";
import { useState } from "react";

export interface PastReview {
  id: string;
  author: string;
  title: string;
  body: string;
  productName: string;
}

function ScarcityBar({ unitsLeft, unitsTotal }: { unitsLeft: number | null; unitsTotal: number | null }) {
  const scarcity = scarcityOf(unitsLeft, unitsTotal);
  if (!scarcity) return null;
  return (
    <div className="mt-4 max-w-md">
      <p className={`text-sm font-semibold ${scarcity.soldOut ? "text-pink" : "text-lime"}`}>{scarcity.text}</p>
      {scarcity.percent !== null ? (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={scarcity.percent} aria-label={scarcity.text}>
          <div className={`h-full ${scarcity.soldOut ? "bg-pink" : "bg-lime"}`} style={{ width: `${scarcity.percent}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function HeroMedia({ drop, blur }: { drop: PublicDropView; blur: boolean }) {
  const blurClass = blur ? "scale-110 blur-2xl" : "";
  if (drop.heroImageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={drop.heroImageUrl} alt="" className={`absolute inset-0 h-full w-full object-cover ${blurClass}`} />
    );
  }
  return <div className={`absolute inset-0 ${blurClass}`} style={{ backgroundColor: drop.hex }} aria-hidden />;
}

function ShareRow({ edition }: { edition: string }) {
  const [copied, setCopied] = useState(false);
  function message() {
    return `${edition} na PULSO. ${window.location.origin}/drops`;
  }
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button type="button" variant="outline" className="rounded-full" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(message())}`, "_blank", "noopener,noreferrer")}>WhatsApp</Button>
      <Button
        type="button"
        variant="outline"
        className="rounded-full"
        onClick={() => {
          const text = message();
          void navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => setCopied(false));
          window.open("https://instagram.com", "_blank", "noopener,noreferrer");
        }}
      >
        Instagram
      </Button>
      {copied ? <p className="self-center text-sm text-lime">Link copiado. Cola no Instagram.</p> : null}
    </div>
  );
}

function WaitlistForm({ dropId, count }: { dropId: string; count: number }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const people = count;
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(erase: boolean) {
    setPending(true);
    setError(null);
    setNotice(null);
    const response = await fetch(erase ? "/api/drops/waitlist/erase" : `/api/drops/${dropId}/waitlist`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(erase ? { email } : { email, consent: true }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(body.error ?? "Não deu para salvar.");
      return;
    }
    setNotice("Pedido recebido.");
  }

  return (
    <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(false); }}>
      <p className="text-sm text-muted-foreground">{people} {people === 1 ? "pessoa na lista" : "pessoas na lista"}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input type="email" required aria-label="E-mail da lista" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="seu@email.com" />
        <Button type="submit" disabled={pending || !consent}>Quero saber</Button>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input className="mt-1" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        <span>Pode guardar meu e-mail para avisar quando este drop abrir. Sem isso, a lista não salva.</span>
      </label>
      {error ? <p className="text-sm text-pink" role="alert">{error}</p> : null}
      {notice ? <p className="text-sm text-lime" role="status">{notice}</p> : null}
      <button type="button" className="text-sm text-muted-foreground underline" disabled={pending || !email} onClick={() => void submit(true)}>Pedir saída da lista</button>
    </form>
  );
}

function Story({ drop }: { drop: PublicDropView }) {
  if (!drop.story && !drop.influencerName && !drop.ingredients) return null;
  return (
    <div className="mt-4 max-w-xl space-y-2 text-sm leading-6">
      {drop.story ? <p>{drop.story}</p> : null}
      {drop.influencerName ? <p className="text-muted-foreground">Collab com {drop.influencerName}.</p> : null}
      {drop.ingredients ? <p className="text-muted-foreground">Ingredientes: {drop.ingredients}. Suplemento não é medicamento.</p> : null}
    </div>
  );
}

function DropHero({ drop }: { drop: PublicDropView }) {
  const upcoming = drop.state === "em_breve";
  const closed = drop.state === "encerrado" || drop.state === "esgotado";
  const target = upcoming ? (drop.startsAt ?? drop.endsAt) : drop.endsAt;
  return (
    <article className="relative overflow-hidden rounded-[1.8rem] border border-white/10">
      <div className="relative min-h-[22rem]">
        <HeroMedia drop={drop} blur={upcoming} />
        <div className="relative flex min-h-[22rem] flex-col justify-end bg-gradient-to-t from-black via-black/55 to-black/10 p-6 md:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-pink">{upcoming ? "Em breve" : closed ? drop.state === "esgotado" ? "Esgotado" : "Encerrado" : "No ar"}</p>
          <h2 className="max-w-3xl font-display text-6xl leading-[0.85] md:text-8xl">{drop.edition}</h2>
          <p className="mt-2 text-lg">{drop.name}{drop.flavorName ? ` · ${drop.flavorName}` : ""}</p>
          {upcoming && drop.teaser ? <p className="mt-2 max-w-xl text-sm text-muted-foreground">{drop.teaser}</p> : null}
          {target ? <div className="mt-4"><Countdown endsAt={target} /></div> : null}
          <ScarcityBar unitsLeft={upcoming ? null : drop.unitsLeft} unitsTotal={upcoming ? null : drop.unitsTotal} />
          <Story drop={drop} />
          <ShareRow edition={drop.edition} />
          {drop.buyHref ? <Button asChild className="mt-4 w-fit rounded-full"><Link href={drop.buyHref}>Garantir</Link></Button> : null}
          {upcoming ? <WaitlistForm dropId={drop.id} count={drop.waitlistCount} /> : null}
        </div>
      </div>
    </article>
  );
}

export function DropsView({ drops, pastReviews }: { drops: PublicDropView[]; pastReviews: PastReview[] }) {
  const hero = drops.find((drop) => drop.state === "no_ar") ?? drops.find((drop) => drop.state === "esgotado") ?? drops.find((drop) => drop.state === "em_breve") ?? null;
  const rest = drops.filter((drop) => drop !== hero && drop.state !== "encerrado");
  const archive = drops.filter((drop) => drop.state === "encerrado");
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-pink">Edição curta</p>
      <h1 className="font-display text-7xl leading-[0.85]">Drops</h1>
      <div className="mt-8 space-y-4">
        {hero ? <DropHero drop={hero} /> : <p className="text-sm text-muted-foreground">Nenhum drop no ar.</p>}
        {rest.map((drop) => <DropHero key={drop.id} drop={drop} />)}
      </div>
      <section className="mt-12" aria-label="Arquivo">
        <h2 className="font-display text-5xl leading-none">Arquivo</h2>
        {archive.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nenhuma edição encerrada. O arquivo aparece quando um drop fecha.</p> : (
          <ol className="mt-4 space-y-3 border-l border-white/15 pl-4">
            {archive.map((drop) => (
              <li key={drop.id}>
                <p className="text-xs uppercase tracking-[0.14em] text-pink">{drop.endsAt?.slice(0, 10) ?? "Encerrado"}</p>
                <p className="font-display text-3xl leading-none">{drop.edition}</p>
                <p className="text-sm text-muted-foreground">{drop.name}{drop.state === "encerrado" ? "" : ""}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
      {pastReviews.length ? (
        <section className="mt-10" aria-label="Avaliações de edições encerradas">
          <h2 className="font-display text-4xl leading-none">Edições anteriores</h2>
          <ul className="mt-4 space-y-3">
            {pastReviews.map((review) => (
              <li key={review.id} className="rounded-[1.2rem] border border-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-lime">{review.productName}</p>
                <p className="font-display text-3xl leading-none">{review.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">{review.body}</p>
                <p className="mt-2 text-xs text-muted-foreground">{review.author}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
