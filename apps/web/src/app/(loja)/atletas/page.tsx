import { AthletePoster } from "@/components/brand/athlete";
import { influencers } from "@pulso/data";
import { loadPublicAthletes, type PublicAthleteCard } from "@/server/public-content";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

export const metadata = { title: "Atletas" };

function AthleteGrid({ people }: { people: PublicAthleteCard[] }) {
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {people.map((influencer) => (
        <Link key={influencer.slug} href={influencer.path}>
          <AthletePoster
            name={influencer.name}
            handle={influencer.handle}
            city={influencer.city}
            accent={influencer.accent}
            variant={influencer.variant}
            className="h-[420px]"
          />
        </Link>
      ))}
    </div>
  );
}

function catalogCards(): PublicAthleteCard[] {
  return influencers.map((influencer) => ({
    slug: influencer.slug,
    name: influencer.name,
    handle: influencer.handle.startsWith("@") ? influencer.handle : `@${influencer.handle}`,
    city: influencer.city,
    accent: influencer.accent,
    variant: influencer.slug.startsWith("luna") ? "luna" : influencer.slug.startsWith("caio") ? "caio" : influencer.slug.startsWith("nanda") ? "nanda" : "theo",
    path: `/atletas/${influencer.slug}`,
  }));
}

async function LiveAthletes() {
  await connection();
  return <AthleteGrid people={await loadPublicAthletes()} />;
}

export default function AthletesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-7xl leading-[0.85]">Atletas</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">Cupom de quem treina com a gente. Não acumula com outro cupom de porcentagem — o maior desconto fica.</p>
      <Suspense fallback={<AthleteGrid people={catalogCards()} />}>
        <LiveAthletes />
      </Suspense>
    </div>
  );
}
