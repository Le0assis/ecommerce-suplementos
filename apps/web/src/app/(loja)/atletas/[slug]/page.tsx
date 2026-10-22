import { AthletePoster } from "@/components/brand/athlete";
import { ApplyCoupon } from "@/components/commerce/apply-coupon";
import { ProductCard } from "@/components/product/product-card";
import { getInfluencer, influencers, products } from "@pulso/data";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  return influencers.map((influencer) => ({ slug: influencer.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const influencer = getInfluencer(slug);
  return { title: influencer?.name ?? "Atleta", description: influencer?.bio };
}

export default async function AthletePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const influencer = getInfluencer(slug);
  if (!influencer) notFound();
  const picks = products.filter((product) => influencer.productSlugs.includes(product.slug));
  const variant = influencer.slug.startsWith("luna") ? "luna" : influencer.slug.startsWith("caio") ? "caio" : influencer.slug.startsWith("nanda") ? "nanda" : "theo";
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[.8fr_1.2fr]">
      <AthletePoster name={influencer.name} handle={influencer.handle} city={influencer.city} accent={influencer.accent} variant={variant} className="min-h-[520px]" />
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">{influencer.sport} · {influencer.followers}</p>
        <h1 className="font-display text-7xl leading-[0.85]">{influencer.name}</h1>
        <p className="mt-3 text-muted-foreground">{influencer.bio}</p>
        <div className="mt-5">
          <ApplyCoupon code={influencer.coupon} label={`Aplicar ${influencer.coupon} · ${influencer.discountPercent}% off`} />
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">{picks.map((product) => <ProductCard key={product.slug} product={product} />)}</div>
      </div>
    </div>
  );
}
