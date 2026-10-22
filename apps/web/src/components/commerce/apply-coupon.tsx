"use client";

import { Button } from "@/components/ui/button";
import { usePulso } from "@/lib/store";

export function ApplyCoupon({ code, label }: { code: string; label: string }) {
  const apply = usePulso((state) => state.applyCoupon);
  return <Button className="rounded-full" onClick={() => apply(code)}>{label}</Button>;
}
