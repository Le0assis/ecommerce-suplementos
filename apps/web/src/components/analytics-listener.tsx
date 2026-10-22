"use client";

import { usePulso } from "@/lib/store";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export function AnalyticsListener() {
  const pathname = usePathname();
  const record = usePulso((state) => state.recordEvent);
  const seen = useRef("");

  useEffect(() => {
    if (seen.current === pathname) return;
    seen.current = pathname;
    record({ name: "page_view", path: pathname });
  }, [pathname, record]);

  return null;
}
