import { CatalogRoute } from "@/components/catalog/catalog-view";
import { Suspense } from "react";

export const metadata = { title: "Busca" };

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="px-4 py-10">Buscando…</p>}>
      <CatalogRoute />
    </Suspense>
  );
}
