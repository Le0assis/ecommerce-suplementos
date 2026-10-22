import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display text-4xl leading-none text-foreground", className)}>
      <svg viewBox="0 0 36 16" className="h-4 w-9 text-lime" aria-hidden="true">
        <path d="M1 9h6l3-7 4 12 3-5h18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      Pulso
    </span>
  );
}
