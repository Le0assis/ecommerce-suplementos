import { catalogPostCards, loadPublicPosts, type PublicPostCard } from "@/server/public-content";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

export const metadata = { title: "Blog" };

function publishedLabel(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return "";
  return value.slice(0, 10).split("-").reverse().join("/");
}

function BlogList({ posts }: { posts: PublicPostCard[] }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="break-words font-display text-7xl leading-[0.85]">Treino e rótulo</h1>
      <div className="mt-8 space-y-4">
        {posts.map((post) => {
          const when = publishedLabel(post.publishedAt);
          return (
            <Link key={post.slug} href={post.path} className="block rounded-[1.4rem] border border-white/10 p-5 hover:border-lime">
              <p className="text-xs uppercase tracking-[0.14em] text-lime">{post.category} · {post.readMinutes} min{when ? ` · ${when}` : ""}</p>
              <h2 className="break-words font-display text-5xl leading-none">{post.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{post.excerpt}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

async function LiveBlog() {
  await connection();
  return <BlogList posts={await loadPublicPosts()} />;
}

export default function BlogPage() {
  return (
    <Suspense fallback={<BlogList posts={catalogPostCards()} />}>
      <LiveBlog />
    </Suspense>
  );
}
