import { CollabView } from "@/components/content/collab-view";
import { loadPublicCollab } from "@/server/public-content";
import { getInfluencer, influencers } from "@pulso/data";
import { notFound } from "next/navigation";

export const instant = false;

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
  const model = await loadPublicCollab(slug);
  if (!model) notFound();
  return <CollabView {...model} />;
}
