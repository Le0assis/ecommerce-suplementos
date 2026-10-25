import { VideoSpot } from "@/components/content/video-spot";
import { ugc, videos } from "@pulso/data";
import Link from "next/link";

export const metadata = { title: "Social" };

export default function SocialPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-7xl leading-[0.85]">Visto no treino</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">UGC ilustrado. Em produção isso entra de Instagram e TikTok com autorização de uso de imagem.</p>
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {videos.map((spot) => <VideoSpot key={spot.id} spot={spot} />)}
      </div>
      <div className="mt-8 columns-1 gap-3 sm:columns-2 lg:columns-4">
        {ugc.map((post) => (
          <article key={post.id} className="mb-3 break-inside-avoid rounded-[1.4rem] p-4" style={{ background: post.accent, color: "#101402" }}>
            <p className="text-xs font-bold uppercase tracking-[0.14em]">{post.handle}</p>
            <p className="mt-8 font-display text-4xl leading-[0.9]">{post.caption}</p>
            <p className="mt-4 text-xs">{post.likes.toLocaleString("pt-BR")} likes</p>
            {post.productSlug ? <Link href={`/loja/${post.productSlug}`} className="mt-3 inline-block text-xs font-bold uppercase tracking-[0.14em] underline">Ver produto</Link> : null}
          </article>
        ))}
      </div>
    </div>
  );
}
