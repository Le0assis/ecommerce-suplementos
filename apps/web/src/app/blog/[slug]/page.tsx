import { ArticleBlocks } from "@/components/content/article-blocks";
import { AuthorCard } from "@/components/content/author-card";
import { RemoteImage } from "@/components/content/remote-image";
import { loadPublicArticle, type PublicArticle } from "@/server/public-content";
import { getPost, posts } from "@pulso/data";
import Link from "next/link";
import { notFound } from "next/navigation";

export const instant = false;

export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  return { title: post?.title ?? "Texto", description: post?.excerpt };
}

export function Article({ article }: { article: PublicArticle }) {
  return (
    <article className="mx-auto min-w-0 max-w-3xl px-4 py-10 [overflow-wrap:anywhere]">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-lime">{article.category} · {article.authorName}</p>
      <h1 className="break-words font-display text-6xl leading-[0.9]">{article.title}</h1>
      <p className="mt-3 text-muted-foreground">{article.excerpt}</p>
      {article.coverUrl ? (
        <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-[1.4rem]">
          <RemoteImage src={article.coverUrl} alt="" fill className="object-cover" sizes="(min-width: 768px) 768px, 100vw" />
        </div>
      ) : null}
      <AuthorCard name={article.authorName} bio={article.authorBio} href={article.authorHref} />
      <div className="mt-6">
        <ArticleBlocks blocks={article.blocks} products={article.products} />
      </div>
      <p className="mt-8 text-sm text-muted-foreground">Suplemento não é medicamento. O texto não promete resultado.</p>
      <p className="mt-4 text-sm"><Link href="/blog" className="text-lime">Todos os textos</Link></p>
    </article>
  );
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await loadPublicArticle(slug);
  if (!article) notFound();
  return <Article article={article} />;
}
