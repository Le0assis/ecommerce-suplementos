"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="font-display text-6xl">Deu ruim no treino</h1>
      <p className="mt-3 text-muted-foreground">A página tropeçou. Tenta de novo.</p>
      <button type="button" onClick={reset} className="mt-6 rounded-full bg-lime px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-primary-foreground">Recarregar</button>
    </div>
  );
}
