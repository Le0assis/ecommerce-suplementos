import { HomeView, type HomeDropCard } from "@/components/home/home-view";
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
  return <HomeView dropCard={homeDrop(await loadPublicDrops())} />;
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeView dropCard={null} />}>
      <HomeLive />
    </Suspense>
  );
}
