import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-pink">404</p>
      <h1 className="font-display text-7xl leading-none">Essa página não treina aqui</h1>
      <p className="mt-3 text-muted-foreground">O link quebrou ou o drop já saiu do ar.</p>
      <Button className="mt-6 rounded-full" asChild><Link href="/loja">Voltar pra loja</Link></Button>
    </div>
  );
}
