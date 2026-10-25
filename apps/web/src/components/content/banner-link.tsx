import { safeBannerHref } from "@/lib/safe-href";
import Link from "next/link";
import type { ReactNode } from "react";

export function BannerLink({ href, className, children }: { href: string | null | undefined; className?: string; children?: ReactNode }) {
  const safe = safeBannerHref(href);
  if (!safe) return <span className={className}>{children}</span>;
  if (safe.startsWith("/")) return <Link href={safe} className={className}>{children}</Link>;
  return <a href={safe} className={className} rel="noreferrer" target="_blank">{children}</a>;
}
