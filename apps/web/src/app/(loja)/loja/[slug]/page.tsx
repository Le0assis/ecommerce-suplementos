import { BuyBox } from "@/components/product/buy-box";
import { ProductCard, Stars } from "@/components/product/product-card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { getProduct, getReviews, products } from "@pulso/data";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProduct(slug);
  return { title: product ? `${product.name} ${product.line}` : "Produto", description: product?.tagline };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();
  const reviews = getReviews(slug);
  const related = products.filter((item) => item.slug !== slug && item.goals.some((goal) => product.goals.includes(goal))).slice(0, 3);
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Suspense fallback={<p>Abrindo o sabor…</p>}>
        <BuyBox product={product} />
      </Suspense>
      <p className="mt-8 max-w-3xl text-base leading-7">{product.description}</p>
      <p className="mt-3 text-sm text-muted-foreground"><strong className="text-foreground">Como usar. </strong>{product.howToUse}</p>
      {product.isKit && product.kitItems ? (
        <ul className="mt-4 text-sm text-muted-foreground">
          {product.kitItems.map((item) => <li key={item.productSlug}>· {item.quantity}× {getProduct(item.productSlug)?.name ?? item.productSlug}</li>)}
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
            {product.reviewCount ? <Stars rating={product.rating} /> : null}
            <ul className="mt-4 space-y-4">
              {reviews.map((review) => (
                <li key={review.id} className="border-t border-white/10 pt-3">
                  <p className="text-lime">{"★".repeat(review.rating)} <span className="text-foreground">{review.title}</span></p>
                  <p className="text-xs text-muted-foreground">{review.author} {review.handle} {review.verified ? "· compra verificada" : ""}</p>
                  <p className="mt-1 text-sm">{review.body}</p>
                  <div className="mt-2 flex gap-2">
                    {review.photos.map((photo) => (
                      <div key={photo.alt} className="grid h-16 w-16 place-items-center rounded-xl p-1 text-center text-[10px] text-primary-foreground" style={{ background: photo.hex }}>{photo.alt}</div>
                    ))}
                  </div>
                </li>
              ))}
              {reviews.length === 0 ? <li>Ainda sem review. O rótulo já está aberto pra leitura.</li> : null}
            </ul>
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
