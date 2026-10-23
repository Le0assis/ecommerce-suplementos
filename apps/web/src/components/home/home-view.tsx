"use client";

import { AthletePoster } from "@/components/brand/athlete";
import { Pack } from "@/components/brand/pack";
import { ProductCard } from "@/components/product/product-card";
import { useStoreData } from "@/components/store-data";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/config";
import { BannerLink } from "@/components/content/banner-link";
import { VideoSpot } from "@/components/content/video-spot";
import { videos } from "@pulso/data";
import { GOALS, formatBRL } from "@pulso/domain";
import Link from "next/link";
import { useState } from "react";
import { Countdown } from "@/components/gamification/countdown";
import { Lift } from "@/components/motion/lift";
import { scarcityOf } from "@/lib/drop-view";

export interface HomeDropCard {
  edition: string;
  name: string;
  endsAt: string | null;
  unitsLeft: number | null;
  unitsTotal: number | null;
}

export interface HomeBanner {
  id: string;
  slot: string;
  title: string;
  subtitle: string | null;
  href: string | null;
}

const marquee = ["PIX 10% OFF", "SABOR ALTO", "FRETE NO CEP", "DROP 04", "CREATINA TODO DIA", "SEM DESCULPA DE RÓTULO", "COLLAB LUNA"];

export function HomeView({ dropCard, banners }: { dropCard: HomeDropCard | null; banners: HomeBanner[] }) {
  const { products, influencers, posts, ugc, reviews } = useStoreData();
  const caos = products.find((product) => product.slug === "caos-pre-treino");
  const [flavorId, setFlavorId] = useState(caos?.flavors[0]?.id ?? "");
  const flavor = caos?.flavors.find((item) => item.id === flavorId) ?? caos?.flavors[0];
  const heroes = products.filter((product) => product.badges.includes("bestseller") || product.badges.includes("collab")).slice(0, 4);
  const marqueeBanners = banners.filter((banner) => banner.slot === "marquee");
  const line = marqueeBanners.length ? marqueeBanners.map((banner) => banner.title) : marquee;
  const highlights = banners.filter((banner) => banner.slot === "destaque" || banner.slot === "hero");

  return (
    <div>
      <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-8 pt-8 lg:grid-cols-[1.1fr_.9fr] lg:pt-14">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-lime">Drop 04 · collab no ar · Gustavo apresenta</p>
          <h1 className="rise-in mt-3 font-display text-[clamp(4.6rem,14vw,8.5rem)] leading-[0.82]">Sabor alto. Treino mais alto.</h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground">Pré, whey e creatina com cara de rua. Pix com {siteConfig.pixDiscountPercent}% off, frete grátis a partir de {formatBRL(siteConfig.freeShippingCents)} e uma raspadinha que pode zerar o Correios.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button className="h-14 rounded-full px-8 text-base uppercase tracking-[0.16em]" asChild><Link href="/loja/caos-pre-treino">Quero o Caos</Link></Button>
            <Button variant="outline" className="h-14 rounded-full px-8 uppercase tracking-[0.16em]" asChild><Link href="/quiz">Descobrir meu stack</Link></Button>
          </div>
        </div>
        <div className="grid grid-cols-[1.1fr_.9fr] items-end gap-3">
          <AthletePoster name="Luna Vaz" handle="@lunavaz" city="São Paulo" accent="#ff5cae" variant="luna" className="min-h-[420px]" />
          {flavor && caos ? (
            <Lift>
              <Link href={`/loja/caos-pre-treino?sabor=${flavor.id}`} className="block">
                <Pack line={caos.line} flavor={flavor.name} hex={flavor.hex} badge="Drop 04" />
              </Link>
            </Lift>
          ) : null}
        </div>
      </section>

      <div className="overflow-hidden border-y border-white/10 bg-lime text-primary-foreground">
        <div className="marquee-track py-3">
          {[...line, ...line].map((item, index) => (
            <span key={`${item}-${index}`} className="px-6 font-display text-3xl">{item}</span>
          ))}
        </div>
      </div>

      {highlights.length ? (
        <section className="mx-auto grid max-w-6xl gap-3 px-4 py-8 md:grid-cols-3">
          {highlights.map((banner) => (
            <BannerLink key={banner.id} href={banner.href} className="rounded-[1.4rem] border border-white/10 p-5">
              <p className="break-words font-display text-4xl leading-none">{banner.title}</p>
              {banner.subtitle ? <p className="mt-2 text-sm text-muted-foreground">{banner.subtitle}</p> : null}
            </BannerLink>
          ))}
        </section>
      ) : null}

      <section className="mx-auto max-w-6xl px-4 py-12">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">01 — Objetivo</p>
        <h2 className="font-display text-6xl leading-none">O que você quer desse treino?</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GOALS.map((goal) => (
            <Link key={goal.id} href={`/objetivos/${goal.id}`} className="rounded-[1.4rem] border border-white/10 bg-black/40 p-5 hover:border-lime">
              <p className="font-display text-4xl leading-none">{goal.label}</p>
              <p className="mt-2 text-sm text-muted-foreground">{goal.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-6xl leading-none">O que tá saindo</h2>
          <Link href="/loja" className="text-sm font-bold uppercase tracking-[0.14em] text-lime">Ver loja</Link>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {heroes.map((product) => <ProductCard key={product.slug} product={product} />)}
        </div>
      </section>

      {caos && flavor ? (
        <section className="mx-auto mt-14 grid max-w-6xl items-center gap-6 px-4 lg:grid-cols-2">
          <div className="flavor-stage rounded-[2rem] p-6" style={{ background: flavor.hex, color: "#101402" }}>
            <p className="text-xs font-bold uppercase tracking-[0.18em]">O sabor é o produto</p>
            <h2 className="font-display text-7xl leading-[0.85]">{flavor.name}</h2>
            <p className="mt-2 max-w-md text-base">{flavor.tagline}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {caos.flavors.map((item) => (
                <button key={item.id} type="button" onClick={() => setFlavorId(item.id)} className={`rounded-full px-4 py-2 text-sm font-semibold ${item.id === flavor.id ? "bg-black text-white" : "bg-black/10"}`}>
                  {item.name}
                </button>
              ))}
            </div>
          </div>
          <Pack line="Pré-treino" flavor={flavor.name} hex={flavor.hex} badge={flavor.limited ? "últimas unidades" : "caos"} className="mx-auto max-w-xs" />
        </section>
      ) : null}

      <section className="mx-auto mt-14 grid max-w-6xl gap-3 px-4 md:grid-cols-3">
        <Link href="/loja" className="rounded-[1.6rem] bg-lime p-6 text-primary-foreground">
          <p className="font-display text-5xl leading-none">Pix {siteConfig.pixDiscountPercent}% off</p>
          <p className="mt-2 text-sm">Em tudo. Sem cupom. O desconto aparece no checkout.</p>
        </Link>
        <Link href="/raspadinha" className="rounded-[1.6rem] bg-pink p-6 text-white">
          <p className="font-display text-5xl leading-none">Raspadinha</p>
          <p className="mt-2 text-sm">Uma por dia. Pode vir frete, pontos ou quase.</p>
        </Link>
        <Link href="/calculadora" className="rounded-[1.6rem] border border-white/10 p-6">
          <p className="font-display text-5xl leading-none">Calcula a dose</p>
          <p className="mt-2 text-sm text-muted-foreground">Proteína e creatina, com a letra miúda do lado.</p>
        </Link>
      </section>

      {dropCard ? (
        <section className="mx-auto mt-14 max-w-6xl px-4">
          <div className="flex flex-col justify-between gap-4 rounded-[1.8rem] border border-white/10 bg-black p-6 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-pink">{dropCard.edition}</p>
              <h2 className="font-display text-5xl leading-none">{dropCard.name} acaba</h2>
              {scarcityOf(dropCard.unitsLeft, dropCard.unitsTotal) ? (
                <p className="mt-2 text-sm text-muted-foreground">{scarcityOf(dropCard.unitsLeft, dropCard.unitsTotal)?.text}</p>
              ) : null}
            </div>
            {dropCard.endsAt ? <Countdown endsAt={dropCard.endsAt} /> : null}
            <Button asChild className="rounded-full"><Link href="/drops">Ver drops</Link></Button>
          </div>
        </section>
      ) : null}

      <section className="mx-auto mt-14 max-w-6xl px-4">
        <h2 className="font-display text-6xl leading-none">Treina com quem aparece</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {influencers.map((influencer) => (
            <Link key={influencer.slug} href={`/atletas/${influencer.slug}`}>
              <AthletePoster
                name={influencer.name}
                handle={influencer.handle}
                city={influencer.city}
                accent={influencer.accent}
                variant={influencer.slug.startsWith("luna") ? "luna" : influencer.slug.startsWith("caio") ? "caio" : influencer.slug.startsWith("nanda") ? "nanda" : "theo"}
                className="h-[380px]"
              />
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-14 max-w-6xl px-4">
        <h2 className="font-display text-6xl leading-none">No ar</h2>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {videos.map((spot) => <VideoSpot key={spot.id} spot={spot} />)}
        </div>
      </section>

      <section className="mx-auto mt-14 max-w-6xl px-4">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-6xl leading-none">Visto no treino</h2>
          <Link href="/social" className="text-sm font-bold uppercase tracking-[0.14em] text-lime">Feed</Link>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {ugc.slice(0, 4).map((post) => (
            <article key={post.id} className="min-h-48 rounded-[1.4rem] p-4" style={{ background: post.accent, color: "#101402" }}>
              <p className="text-xs font-bold uppercase tracking-[0.14em]">{post.handle}</p>
              <p className="mt-6 font-display text-4xl leading-none">{post.caption}</p>
              <p className="mt-4 text-xs">{post.likes.toLocaleString("pt-BR")} likes</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-14 grid max-w-6xl gap-4 px-4 lg:grid-cols-[.8fr_1.2fr]">
        <div className="rounded-[1.8rem] border border-white/10 p-6">
          <h2 className="font-display text-6xl leading-none">Quem já tomou</h2>
          <ul className="mt-4 space-y-4">
            {reviews.slice(0, 3).map((review) => (
              <li key={review.id}>
                <p className="text-lime">{"★".repeat(review.rating)}</p>
                <p className="font-semibold">{review.title}</p>
                <p className="text-sm text-muted-foreground">{review.body}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-display text-6xl leading-none">Conteúdo de treino</h2>
          <div className="mt-4 grid gap-3">
            {posts.slice(0, 3).map((post) => (
              <Link key={post.slug} href={`/blog/${post.slug}`} className="rounded-[1.4rem] border border-white/10 p-4 hover:border-lime">
                <p className="text-xs uppercase tracking-[0.14em] text-lime">{post.category} · {post.readMinutes} min</p>
                <p className="font-display text-4xl leading-none">{post.title}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
