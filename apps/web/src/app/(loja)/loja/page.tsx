import { CatalogRoute } from "@/components/catalog/catalog-view";
import { loadPublicProducts } from "@/server/public-catalog";
import { connection } from "next/server";
import { Suspense } from "react";

export const metadata = { title: "Loja" };

async function LiveShop() {
  await connection();
  const products = await loadPublicProducts();
  return <CatalogRoute products={products} />;
}

export default function ShopPage() {
  return (
    <Suspense fallback={<p className="px-4 py-10">Abrindo a prateleira…</p>}>
      <LiveShop />
    </Suspense>
  );
}
