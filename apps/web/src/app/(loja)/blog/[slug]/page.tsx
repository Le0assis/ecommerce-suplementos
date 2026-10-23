import { ArticleBlocks } from "@/components/content/article-blocks";
import { AuthorCard } from "@/components/content/author-card";
import { resolveArticle, type PublicArticle } from "@/server/public-content";
import { getPost, posts, products } from "@pulso/data";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  return { title: post?.title ?? "Texto", description: post?.excerpt };
}

function catalogArticle(slug: string): PublicArticle | null {
  const post = getPost(slug);
  if (!post) return null;
  return {
    title: post.title,
    excerpt: post.excerpt,
    category: post.category,
    authorName: post.author,
    authorBio: "",
    authorHref: null,
    blocks: post.body.map((text, index) => ({ id: `${post.slug}-p${index + 1}`, type: "paragrafo" as const, text })),
    products: products.map((product) => ({
      id: product.id,
      slug: product.slug,
      name: product.name,
      line: product.line,
      hex: product.flavors[0]?.hex ?? "#d6ff3c",
    })),
  };
}

function Article({ article }: { article: PublicArticle }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-lime">{article.category} · {article.authorName}</p>
      <h1 className="font-display text-6xl leading-[0.9]">{article.title}</h1>
      <p className="mt-3 text-muted-foreground">{article.excerpt}</p>
      <AuthorCard name={article.authorName} bio={article.authorBio} href={article.authorHref} />
      <div className="mt-6">
        <ArticleBlocks blocks={article.blocks} products={article.products} />
      </div>
      <p className="mt-8 text-sm text-muted-foreground">Suplemento não é medicamento. O texto não promete resultado.</p>
      <p className="mt-4 text-sm"><Link href="/blog" className="text-lime">Todos os textos</Link></p>
    </article>
  );
}

async function LiveArticle({ slug }: { slug: string }) {
  await connection();
  const article = resolveArticle(slug);
  if (!article) notFound();
  return <Article article={article} />;
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shell = catalogArticle(slug);
  return (
    <Suspense fallback={shell ? <Article article={shell} /> : <p className="px-4 py-10">Abrindo o texto…</p>}>
      <LiveArticle slug={slug} />
    </Suspense>
  );
}
