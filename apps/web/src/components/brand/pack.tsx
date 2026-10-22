import { cn, inkForHex } from "@/lib/utils";

export function Pack({
  line,
  flavor,
  hex,
  badge,
  className,
}: {
  line: string;
  flavor: string;
  hex: string;
  badge?: string;
  className?: string;
}) {
  const ink = inkForHex(hex);
  return (
    <div className={cn("relative aspect-[3/4] w-full", className)} aria-hidden="true">
      <div
        className="absolute inset-x-[8%] top-0 h-[10%] rounded-t-[1.4rem] opacity-80"
        style={{ background: ink === "#101402" ? "rgba(0,0,0,.35)" : "rgba(255,255,255,.25)" }}
      />
      <div
        className="absolute inset-x-0 top-[6%] bottom-0 overflow-hidden rounded-[1.6rem] border border-white/15 shadow-[0_24px_60px_rgba(0,0,0,.45)]"
        style={{ background: `linear-gradient(160deg, ${hex} 0%, ${hex} 42%, #09090b 42%, #09090b 100%)`, color: ink }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,.45),transparent_28%)]" />
        <div className="relative flex h-full flex-col justify-between p-4">
          <div>
            <p className="font-display text-4xl leading-none" style={{ color: ink }}>PULSO</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: ink }}>{line}</p>
          </div>
          <div className="rounded-2xl bg-black/75 p-3 text-white">
            {badge ? <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-lime">{badge}</p> : null}
            <p className="font-display text-3xl leading-none text-white">{flavor}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
