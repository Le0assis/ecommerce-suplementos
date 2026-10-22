import { CatalogRoute } from "@/components/catalog/catalog-view";
import { Suspense } from "react";

export const metadata = { title: "Loja" };

export default function ShopPage() {
  return (
    <Suspense fallback={<p className="px-4 py-10">Abrindo a prateleira…</p>}>
      <CatalogRoute />
    </Suspense>
  );
}
