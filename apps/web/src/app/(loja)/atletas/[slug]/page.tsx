import { CollabView } from "@/components/content/collab-view";
import { resolveCollab, type CollabPageModel } from "@/server/public-content";
import { getInfluencer, influencers, products } from "@pulso/data";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export function generateStaticParams() {
  return influencers.map((influencer) => ({ slug: influencer.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const influencer = getInfluencer(slug);
  return { title: influencer?.name ?? "Atleta", description: influencer?.bio };
}

function catalogShell(slug: string): CollabPageModel | null {
  const influencer = getInfluencer(slug);
  if (!influencer) return null;
  const handle = influencer.handle.replace(/^@/, "");
  return {
    name: influencer.name,
    handle: influencer.handle.startsWith("@") ? influencer.handle : `@${influencer.handle}`,
    city: influencer.city,
    sport: influencer.sport,
    followers: influencer.followers,
    bio: influencer.bio,
    story: "",
    accent: influencer.accent,
    coupon: influencer.coupon,
    discountPercent: influencer.discountPercent,
    instagramUrl: `https://instagram.com/${handle}`,
    variant: influencer.slug.startsWith("luna") ? "luna" : influencer.slug.startsWith("caio") ? "caio" : influencer.slug.startsWith("nanda") ? "nanda" : "theo",
    quotes: [],
    images: [],
    products: products.filter((product) => influencer.productSlugs.includes(product.slug)),
    posts: [],
  };
}

async function LiveCollab({ slug }: { slug: string }) {
  await connection();
  const model = resolveCollab(slug);
  if (!model) notFound();
  return <CollabView {...model} />;
}

export default async function AthletePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shell = catalogShell(slug);
  return (
    <Suspense fallback={shell ? <CollabView {...shell} /> : <p className="px-4 py-10">Abrindo a collab…</p>}>
      <LiveCollab slug={slug} />
    </Suspense>
  );
}
