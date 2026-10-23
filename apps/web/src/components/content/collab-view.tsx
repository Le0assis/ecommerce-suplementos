"use client";

import { AthletePoster } from "@/components/brand/athlete";
import { ApplyCoupon } from "@/components/commerce/apply-coupon";
import { ProductCard } from "@/components/product/product-card";
import { Button } from "@/components/ui/button";
import { safeBannerHref } from "@/lib/safe-href";
import type { Product } from "@pulso/domain";
import Link from "next/link";
import { useEffect, useState } from "react";

export interface CollabImage {
  id: string;
  url: string | null;
  alt: string;
  caption: string;
  href: string | null;
  hex: string;
}

export interface CollabPost {
  slug: string;
  title: string;
  excerpt: string;
}

export function CollabView({
  name,
  handle,
  city,
  sport,
  followers,
  bio,
  story,
  accent,
  coupon,
  discountPercent,
  instagramUrl,
  variant,
  quotes,
  images,
  products,
  posts,
}: {
  name: string;
  handle: string;
  city: string;
  sport: string;
  followers: string;
  bio: string;
  story: string;
  accent: string;
  coupon: string;
  discountPercent: number;
  instagramUrl: string;
  variant: "luna" | "caio" | "nanda" | "theo";
  quotes: { id: string; body: string }[];
  images: CollabImage[];
  products: Product[];
  posts: CollabPost[];
}) {
  const shownQuotes = quotes.slice(0, 4);
  const portrait = images[0];
  const profile = safeBannerHref(instagramUrl);
  const gallery = portrait?.url ? images.slice(1) : images;
  const copy = story.trim() || bio;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 pb-28">
      <div className="grid items-start gap-6 md:grid-cols-[280px_1fr]">
        {portrait?.url ? (
          <figure className="mx-auto w-full max-w-[280px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={portrait.url} alt={portrait.alt} className="h-[280px] w-full rounded-[1.8rem] border border-white/10 object-cover" />
          </figure>
        ) : (
          <AthletePoster name={name} handle={handle} city={city} accent={accent} variant={variant} compact className="mx-auto h-[280px] w-full max-w-[280px]" />
        )}
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">{sport} · {followers}</p>
          <h1 className="font-display text-6xl leading-[0.85] md:text-7xl">{name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{handle} · {city}</p>
          <p className="mt-4 max-w-xl text-base leading-7">{copy}</p>
          {profile ? (
            <Button asChild className="mt-4 hidden rounded-full md:inline-flex">
              <a href={profile} target="_blank" rel="noreferrer">Seguir no Instagram</a>
            </Button>
          ) : null}
        </div>
      </div>
      {shownQuotes.length ? <QuoteRotator quotes={shownQuotes} accent={accent} /> : null}
      {gallery.length ? <PhotoCarousel images={gallery} fallbackHref={instagramUrl} /> : null}
      <div className="mt-6">
        <ApplyCoupon code={coupon} label={`Aplicar ${coupon} · ${discountPercent}% off`} />
        <p className="mt-2 text-xs text-muted-foreground">O cupom percentual não soma com o desconto de kit. Vale o maior, com teto de 30%.</p>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">{products.map((product) => <ProductCard key={product.slug} product={product} />)}</div>
      {posts.length ? (
        <section className="mt-10">
          <h2 className="font-display text-4xl leading-none">No blog</h2>
          <ul className="mt-4 space-y-3">
            {posts.map((post) => {
              const href = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(post.slug) ? `/blog/${post.slug}` : null;
              const body = (
                <>
                  <span className="font-display text-3xl leading-none">{post.title}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{post.excerpt}</span>
                </>
              );
              return (
                <li key={post.slug}>
                  {href ? <Link href={href} className="block rounded-[1.2rem] border border-white/10 p-4 hover:border-lime">{body}</Link> : <div className="rounded-[1.2rem] border border-white/10 p-4">{body}</div>}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {profile ? (
        <a href={profile} target="_blank" rel="noreferrer" className="fixed inset-x-4 bottom-4 z-20 grid h-12 place-items-center rounded-full bg-lime font-semibold text-primary-foreground md:hidden">
          Seguir no Instagram
        </a>
      ) : null}
    </div>
  );
}

function QuoteRotator({ quotes, accent }: { quotes: { id: string; body: string }[]; accent: string }) {
  const [index, setIndex] = useState(0);
  const current = quotes[index] ?? quotes[0];

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches || quotes.length < 2) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % quotes.length), 4000);
    return () => window.clearInterval(timer);
  }, [quotes.length]);

  if (!current) return null;
  return (
    <section className="mt-8" aria-label="Frases">
      <blockquote className="font-display text-4xl leading-none md:text-5xl" style={{ color: accent }}>{current.body}</blockquote>
      {quotes.length > 1 ? (
        <div className="mt-3 flex gap-2">
          {quotes.map((quote, quoteIndex) => (
            <button
              key={quote.id}
              type="button"
              aria-label={`Frase ${quoteIndex + 1}`}
              aria-current={quoteIndex === index}
              className={`h-2 w-6 rounded-full ${quoteIndex === index ? "bg-lime" : "bg-white/20"}`}
              onClick={() => setIndex(quoteIndex)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function PhotoCarousel({ images, fallbackHref }: { images: CollabImage[]; fallbackHref: string }) {
  const [index, setIndex] = useState(0);
  const current = images[index] ?? images[0];
  if (!current) return null;
  const href = safeBannerHref(current.href) ?? safeBannerHref(fallbackHref);
  const frame = current.url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={current.url} alt={current.alt} className="h-72 w-full object-cover md:h-96" />
  ) : (
    <div className="grid h-72 place-items-center md:h-96" style={{ backgroundColor: current.hex }} role="img" aria-label={current.alt} />
  );
  return (
    <section className="mt-8" aria-label="Fotos">
      {href ? <a href={href} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[1.6rem] border border-white/10">{frame}</a> : <div className="overflow-hidden rounded-[1.6rem] border border-white/10">{frame}</div>}
      {current.caption ? <p className="mt-2 text-sm text-muted-foreground">{current.caption}</p> : null}
      {images.length > 1 ? (
        <div className="mt-3 flex gap-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setIndex((value) => (value - 1 + images.length) % images.length)}>Anterior</Button>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setIndex((value) => (value + 1) % images.length)}>Próxima</Button>
        </div>
      ) : null}
    </section>
  );
}
