import { getPost, posts } from "@pulso/data";
import Link from "next/link";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  return { title: post?.title ?? "Texto", description: post?.excerpt };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-lime">{post.category} · {post.author}</p>
      <h1 className="font-display text-6xl leading-[0.9]">{post.title}</h1>
      <p className="mt-3 text-muted-foreground">{post.excerpt}</p>
      <div className="mt-6 space-y-4 text-base leading-7">
        {post.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </div>
      <p className="mt-8 text-sm"><Link href="/blog" className="text-lime">Todos os textos</Link></p>
    </article>
  );
}
