import { WaitlistScreen } from "@/components/admin/waitlist-screen";
import { loadPublicDrops } from "@/server/public-drops";
import { connection } from "next/server";
import { Suspense } from "react";

export const metadata = { title: "Lista de espera" };

async function WaitlistPage() {
  await connection();
  const drops = await loadPublicDrops();
  return <WaitlistScreen publicDrops={drops.map((drop) => ({ id: drop.id, edition: drop.edition, name: drop.name }))} />;
}

export default function AdminWaitlistPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando a lista…</p>}>
      <WaitlistPage />
    </Suspense>
  );
}
