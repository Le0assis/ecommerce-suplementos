import { HomeView, type HomeDropCard } from "@/components/home/home-view";
import { loadPublicBanners } from "@/server/public-catalog";
import { loadPublicDrops } from "@/server/public-drops";
import { connection } from "next/server";
import { Suspense } from "react";

function homeDrop(drops: Awaited<ReturnType<typeof loadPublicDrops>>): HomeDropCard | null {
  const drop = drops.find((item) => item.id === "drop-04-melancia") ?? drops.find((item) => item.state === "no_ar");
  if (!drop) return null;
  return { edition: drop.edition, name: drop.name, endsAt: drop.endsAt, unitsLeft: drop.unitsLeft, unitsTotal: drop.unitsTotal };
}

async function HomeLive() {
  await connection();
  const [drops, banners] = await Promise.all([loadPublicDrops(), loadPublicBanners()]);
  return <HomeView dropCard={homeDrop(drops)} banners={banners} />;
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeView dropCard={null} banners={[]} />}>
      <HomeLive />
    </Suspense>
  );
}
