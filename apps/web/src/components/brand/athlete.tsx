import { cn } from "@/lib/utils";

export function AthletePoster({
  name,
  handle,
  accent,
  city,
  variant = "luna",
  compact = false,
  className,
}: {
  name: string;
  handle: string;
  accent: string;
  city: string;
  variant?: "luna" | "caio" | "nanda" | "theo";
  compact?: boolean;
  className?: string;
}) {
  return (
    <figure className={cn("relative overflow-hidden rounded-[1.8rem] border border-white/10 bg-black", className)}>
      <svg viewBox="0 0 360 460" className="h-full w-full" role="img" aria-label={`Ilustração de ${name}`}>
        <rect width="360" height="460" fill="#09090b" />
        <circle cx="280" cy="80" r="90" fill={accent} opacity="0.9" />
        <circle cx="40" cy="400" r="70" fill="#d6ff3c" opacity="0.85" />
        {variant === "luna" ? <Luna accent={accent} /> : null}
        {variant === "caio" ? <Caio /> : null}
        {variant === "nanda" ? <Nanda accent={accent} /> : null}
        {variant === "theo" ? <Theo accent={accent} /> : null}
      </svg>
      {compact ? null : (
        <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black via-black/70 to-transparent p-4">
          <div>
            <p className="font-display text-5xl leading-none text-white">{name}</p>
            <p className="text-sm text-white/80">{handle} · {city}</p>
          </div>
          <span className="rounded-full bg-lime px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-primary-foreground">Collab</span>
        </figcaption>
      )}
    </figure>
  );
}

function Luna({ accent }: { accent: string }) {
  return (
    <g>
      <path d="M70 250c20-120 70-170 120-170 66 0 100 70 110 150 8 60-10 130-40 170H100c-20-40-40-90-30-150z" fill="#f3d2c4" />
      <path d="M78 150c10-70 60-110 130-90 20 6 30-20 10-40-50-10-130 10-160 80-10 24 4 42 20 50z" fill={accent} />
      <path d="M150 210c-8 20 6 34 22 30M210 208c-4 22 14 34 26 24" stroke="#1a1a1a" strokeWidth="6" fill="none" strokeLinecap="round" />
      <rect x="132" y="196" width="110" height="28" rx="14" fill="#111" />
      <circle cx="248" cy="230" r="8" fill="#d6ff3c" />
      <path d="M120 330h130l16 80H108z" fill="#111" />
      <text x="150" y="372" fill="#d6ff3c" fontSize="22" fontFamily="sans-serif">PULSO</text>
    </g>
  );
}

function Caio() {
  return (
    <g>
      <path d="M90 280c10-90 40-150 90-160 50-8 90 40 100 120 10 70-10 140-30 180H120c-16-40-36-80-30-140z" fill="#e7c2a8" />
      <path d="M110 150c20-40 90-60 140-20 10 8 8 20-6 18-40-16-90-6-110 20-8 10-16-6-24-18z" fill="#1a1a1a" />
      <circle cx="155" cy="210" r="5" fill="#111" />
      <circle cx="210" cy="208" r="5" fill="#111" />
      <path d="M168 240c12 10 28 10 40 0" stroke="#111" strokeWidth="4" fill="none" />
      <path d="M100 340h160l20 70H90z" fill="#d6ff3c" />
      <text x="145" y="382" fill="#101402" fontSize="22" fontFamily="sans-serif">PULSO</text>
    </g>
  );
}

function Nanda({ accent }: { accent: string }) {
  return (
    <g>
      <path d="M150 120c30-40 90-20 100 30 20 10 30 40 10 60-30 8-70 0-90-20-16-16-28-40-20-70z" fill="#1a1a1a" />
      <circle cx="190" cy="210" r="58" fill="#f0c7b0" />
      <path d="M150 198h80" stroke={accent} strokeWidth="10" strokeLinecap="round" />
      <circle cx="168" cy="214" r="4" fill="#111" />
      <circle cx="214" cy="214" r="4" fill="#111" />
      <path d="M110 300h150l24 110H96z" fill="#111" />
      <path d="M150 330h80" stroke="#d6ff3c" strokeWidth="8" />
    </g>
  );
}

function Theo({ accent }: { accent: string }) {
  return (
    <g>
      <path d="M120 150h130l-10 40H130z" fill={accent} />
      <circle cx="186" cy="220" r="54" fill="#e8bea2" />
      <path d="M150 150h70v24H150z" fill="#111" />
      <circle cx="168" cy="220" r="4" fill="#111" />
      <circle cx="208" cy="218" r="4" fill="#111" />
      <path d="M100 320h160v90H100z" fill="#111" />
      <text x="148" y="372" fill="#d6ff3c" fontSize="22" fontFamily="sans-serif">PULSO</text>
    </g>
  );
}
