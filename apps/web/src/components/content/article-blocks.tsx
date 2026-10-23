import type { AdminPostBlock } from "@/lib/admin-types";
import Link from "next/link";

export interface ArticleProduct {
  id: string;
  slug: string;
  name: string;
  line: string;
  hex: string;
}

export function ArticleBlocks({ blocks, products }: { blocks: AdminPostBlock[]; products: ArticleProduct[] }) {
  return (
    <div className="space-y-5 text-base leading-7">
      {blocks.map((block) => {
        if (block.type === "paragrafo") return <p key={block.id}>{block.text}</p>;
        if (block.type === "titulo") return <h2 key={block.id} className="font-display text-4xl leading-none">{block.text}</h2>;
        if (block.type === "citacao_lateral") {
          const right = block.side === "direita";
          return (
            <blockquote key={block.id} className={`max-w-sm font-display text-3xl leading-none ${right ? "border-r-4 border-pink pr-4 md:ml-auto" : "border-l-4 border-lime pl-4"}`}>
              {block.text}
            </blockquote>
          );
        }
        if (block.type === "imagem") {
          return (
            <figure key={block.id}>
              {block.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={block.url} alt={block.alt} className="w-full rounded-[1.4rem] border border-white/10" />
              ) : (
                <div className="grid h-48 place-items-center rounded-[1.4rem] border border-white/10 bg-white/5 text-sm text-muted-foreground">{block.alt}</div>
              )}
              {block.caption ? <figcaption className="mt-2 text-sm text-muted-foreground">{block.caption}</figcaption> : null}
            </figure>
          );
        }
        const product = products.find((item) => item.id === block.productId);
        if (!product) return <p key={block.id} className="text-sm text-muted-foreground">Produto indisponível.</p>;
        return (
          <Link key={block.id} href={`/loja/${product.slug}`} className="flex items-center gap-4 rounded-[1.4rem] border border-white/10 p-4 hover:border-lime">
            <span className="size-14 shrink-0 rounded-2xl" style={{ backgroundColor: product.hex }} aria-hidden />
            <span>
              <span className="block text-xs uppercase tracking-[0.14em] text-lime">{product.line}</span>
              <span className="font-display text-3xl leading-none">{product.name}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
