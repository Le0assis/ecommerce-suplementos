import { applyContentPatches, cmsCatalog } from "@pulso/data";
import Link from "next/link";

export const metadata = { title: "Conteúdo" };

export default function ContentPage() {
  const entries = applyContentPatches(cmsCatalog());
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">CMS de leitura</p>
      <h1 className="font-display text-7xl leading-none">O que está publicado</h1>
      <p className="mt-3 text-sm text-muted-foreground">Posts, UGC e spots saem do mesmo catálogo. O admin da etapa seguinte esconde e renomeia por cima, sem apagar o original.</p>
      <ul className="mt-8 space-y-4">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-[1.4rem] border border-white/10 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-pink">{entry.kind}</p>
            <h2 className="font-display text-4xl leading-none">{entry.title}</h2>
            <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{entry.body}</p>
            {entry.kind === "post" ? <Link href={`/blog/${entry.slug}`} className="mt-2 inline-block text-sm text-lime">Ler</Link> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
