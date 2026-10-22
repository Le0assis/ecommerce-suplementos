import { AthletePoster } from "@/components/brand/athlete";
import { influencers } from "@pulso/data";
import Link from "next/link";

export const metadata = { title: "Atletas" };

export default function AthletesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-7xl leading-[0.85]">Atletas</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">Cupom de quem treina com a gente. Não acumula com outro cupom de porcentagem — o maior desconto fica.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {influencers.map((influencer) => (
          <Link key={influencer.slug} href={`/atletas/${influencer.slug}`}>
            <AthletePoster
              name={influencer.name}
              handle={influencer.handle}
              city={influencer.city}
              accent={influencer.accent}
              variant={influencer.slug.startsWith("luna") ? "luna" : influencer.slug.startsWith("caio") ? "caio" : influencer.slug.startsWith("nanda") ? "nanda" : "theo"}
              className="h-[420px]"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
