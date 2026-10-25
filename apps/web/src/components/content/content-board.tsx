"use client";

import { applyContentPatches, type CmsEntry } from "@pulso/data";
import { usePulso } from "@/lib/store";
import Link from "next/link";

export function ContentBoard({ entries }: { entries: CmsEntry[] }) {
  const patches = usePulso((state) => state.contentPatches);
  const hydrated = usePulso((state) => state.hydrated);
  const visible = applyContentPatches(entries, hydrated ? patches : {});
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">CMS de leitura</p>
      <h1 className="font-display text-7xl leading-none">O que está publicado</h1>
      <p className="mt-3 text-sm text-muted-foreground">Posts, UGC e spots saem do mesmo catálogo. O admin esconde e renomeia por cima, sem apagar o original. O patch só entra depois que o navegador reidrata.</p>
      <ul className="mt-8 space-y-4">
        {visible.map((entry) => (
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
