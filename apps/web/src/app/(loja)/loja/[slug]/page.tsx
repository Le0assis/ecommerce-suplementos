import { ReviewList } from "@/components/content/review-list";
import { BuyBox } from "@/components/product/buy-box";
import { ProductCard } from "@/components/product/product-card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { jsonLdHtml } from "@/lib/safe-href";
import { loadPublicProduct } from "@/server/public-catalog";
import { products } from "@pulso/data";
import type { CatalogProduct } from "@pulso/data";
import type { Review } from "@pulso/domain";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const loaded = products.find((item) => item.slug === slug);
  return { title: loaded ? `${loaded.name} ${loaded.line}` : "Produto", description: loaded?.tagline };
}

export default function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<p className="px-4 py-8">Abrindo o sabor…</p>}>
      <LiveProduct params={params} />
    </Suspense>
  );
}

async function LiveProduct({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await connection();
  const loaded = await loadPublicProduct(slug);
  if (!loaded) notFound();
  return <ProductArticle product={loaded.product} reviews={loaded.reviews} related={loaded.related} names={loaded.names} />;
}

function ProductArticle({ product, reviews, related, names }: { product: CatalogProduct; reviews: Review[]; related: CatalogProduct[]; names: Record<string, string> }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${product.name} ${product.line}`,
    description: product.description,
    brand: { "@type": "Brand", name: "PULSO" },
    aggregateRating: product.reviewCount ? { "@type": "AggregateRating", ratingValue: product.rating, reviewCount: product.reviewCount } : undefined,
  };

  return (
    <article className="mx-auto max-w-6xl px-4 py-8">
      <script type="application/ld+json">{jsonLdHtml(jsonLd)}</script>
      <Suspense fallback={<p>Abrindo o sabor…</p>}>
        <BuyBox product={product} />
      </Suspense>
      <p className="mt-8 max-w-3xl text-base leading-7">{product.description}</p>
      <p className="mt-3 text-sm text-muted-foreground"><strong className="text-foreground">Como usar. </strong>{product.howToUse}</p>
      {product.isKit && product.kitItems ? (
        <ul className="mt-4 text-sm text-muted-foreground">
          {product.kitItems.map((item) => <li key={item.productSlug}>· {item.quantity}× {names[item.productSlug] ?? item.productSlug}</li>)}
        </ul>
      ) : null}
      <Accordion type="single" collapsible className="mt-8 rounded-[1.4rem] border border-white/10 px-4">
        <AccordionItem value="rotulo">
          <AccordionTrigger>Rótulo e ANVISA</AccordionTrigger>
          <AccordionContent>
            <p>Notificação ilustrativa: {product.label.registration}. {product.label.category}. Porção de {product.label.serving}. {product.label.servingsPerContainer} porções no tamanho de referência.</p>
            <p className="mt-2"><strong>Ingredientes. </strong>{product.label.ingredients}</p>
            <p className="mt-2"><strong>Alergênicos. </strong>{product.label.allergens}</p>
            <table className="mt-3 w-full text-left text-sm">
              <caption className="mb-2 text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">Tabela por porção — dados fictícios no formato de suplemento alimentar</caption>
              <tbody>
                {product.label.nutrition.map((row) => (
                  <tr key={row.nutrient} className="border-t border-white/10">
                    <th className="py-2 font-medium">{row.nutrient}</th>
                    <td>{row.amount}</td>
                    <td>{row.dailyValue ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="mt-3 space-y-1">{product.label.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            <p className="mt-3 text-xs text-muted-foreground">{product.label.manufacturer}</p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="reviews">
          <AccordionTrigger>Avaliações ({reviews.length})</AccordionTrigger>
          <AccordionContent>
            <ReviewList reviews={reviews} rating={product.rating} reviewCount={product.reviewCount} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <h2 className="mt-10 font-display text-5xl">Também combina</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {related.map((item) => <ProductCard key={item.slug} product={item} />)}
      </div>
    </article>
  );
}
