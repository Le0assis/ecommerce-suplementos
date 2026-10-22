import { posts } from "@pulso/data";
import Link from "next/link";

export const metadata = { title: "Blog" };

export default function BlogPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-7xl leading-[0.85]">Treino e rótulo</h1>
      <div className="mt-8 space-y-4">
        {posts.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`} className="block rounded-[1.4rem] border border-white/10 p-5 hover:border-lime">
            <p className="text-xs uppercase tracking-[0.14em] text-lime">{post.category} · {post.readMinutes} min · {post.publishedAt.split("-").reverse().join("/")}</p>
            <h2 className="font-display text-5xl leading-none">{post.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{post.excerpt}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
