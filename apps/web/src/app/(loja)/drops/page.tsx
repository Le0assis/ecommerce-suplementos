import { DropsView, type PastReview } from "@/components/drops/drops-view";
import { loadPublicDrops } from "@/server/public-drops";
import { reviews } from "@pulso/data";
import { connection } from "next/server";
import { Suspense } from "react";

export const metadata = { title: "Drops" };

function DropsFallback() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-pink">Edição curta</p>
      <h1 className="font-display text-7xl leading-[0.85]">Drops</h1>
      <p className="mt-6 text-sm text-muted-foreground">Abrindo as edições…</p>
    </div>
  );
}

async function DropsLive() {
  await connection();
  const drops = await loadPublicDrops();
  const closed = new Set(drops.filter((drop) => drop.state === "encerrado" && drop.productSlug).map((drop) => drop.productSlug));
  const pastReviews: PastReview[] = reviews
    .filter((review) => closed.has(review.productSlug))
    .slice(0, 3)
    .map((review) => ({
      id: review.id,
      author: review.author,
      title: review.title,
      body: review.body,
      productName: drops.find((drop) => drop.productSlug === review.productSlug)?.name ?? review.productSlug,
    }));
  return <DropsView drops={drops} pastReviews={pastReviews} />;
}

export default function DropsPage() {
  return (
    <Suspense fallback={<DropsFallback />}>
      <DropsLive />
    </Suspense>
  );
}
