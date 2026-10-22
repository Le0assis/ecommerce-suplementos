"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  const id = setInterval(callback, 1000);
  return () => clearInterval(id);
}

export function Countdown({ endsAt }: { endsAt: string }) {
  const now = useSyncExternalStore(subscribe, () => Date.now(), () => null);
  if (now === null) return <p className="font-display text-4xl">--d --h --m</p>;
  const diff = new Date(endsAt).getTime() - now;
  if (diff <= 0) return <p className="font-display text-4xl text-pink">Encerrado</p>;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return (
    <p className="font-display text-5xl leading-none" aria-live="polite">
      {days}d {hours}h {minutes}m {seconds}s
    </p>
  );
}
