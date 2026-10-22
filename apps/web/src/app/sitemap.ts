import { influencers, posts, products } from "@pulso/data";
import { GOALS } from "@pulso/domain";
import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.siteUrl;
  const staticPaths = ["", "/loja", "/quiz", "/calculadora", "/kits", "/drops", "/atletas", "/blog", "/social", "/conteudo", "/sobre", "/ajuda", "/entrega", "/trocas", "/privacidade", "/rotulos", "/raspadinha"];
  return [
    ...staticPaths.map((path) => ({ url: `${base}${path || "/"}`, changeFrequency: "weekly" as const, priority: path === "" ? 1 : 0.7 })),
    ...products.map((product) => ({ url: `${base}/loja/${product.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...posts.map((post) => ({ url: `${base}/blog/${post.slug}`, changeFrequency: "monthly" as const, priority: 0.6 })),
    ...influencers.map((influencer) => ({ url: `${base}/atletas/${influencer.slug}`, changeFrequency: "monthly" as const, priority: 0.6 })),
    ...GOALS.map((goal) => ({ url: `${base}/objetivos/${goal.id}`, changeFrequency: "weekly" as const, priority: 0.5 })),
  ];
}
