export function InfoPage({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">{eyebrow}</p>
      <h1 className="font-display text-6xl leading-[0.9]">{title}</h1>
      <div className="mt-6 space-y-4 text-sm leading-7 text-foreground/90">{children}</div>
    </article>
  );
}
