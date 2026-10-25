import Link from "next/link";

export function AuthorCard({ name, bio, href }: { name: string; bio: string; href: string | null }) {
  const body = (
    <>
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-lime font-display text-2xl text-primary-foreground" aria-hidden>
        {name.slice(0, 1) || "P"}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-bold uppercase tracking-[0.14em] text-lime">Autor</span>
        <span className="font-display text-3xl leading-none">{name}</span>
        {bio ? <span className="mt-1 block text-sm text-muted-foreground">{bio}</span> : null}
      </span>
    </>
  );
  const className = "mt-6 flex min-w-0 items-center gap-3 rounded-[1.2rem] border border-white/10 p-3 [overflow-wrap:anywhere]";
  if (!href) return <div className={className}>{body}</div>;
  return <Link href={href} className={`${className} hover:border-lime`}>{body}</Link>;
}
