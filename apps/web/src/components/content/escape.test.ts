import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";
import { Article } from "@/app/blog/[slug]/page";
import { BannerLink } from "@/components/content/banner-link";
import { ProductCard } from "@/components/product/product-card";
import type { PublicArticle } from "@/server/public-content";
import { getProduct } from "@pulso/data";

const payload = `<script>alert("xss")</script><img src=x onerror=alert(1)>`;

function htmlOf(node: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(node);
}

function refusesRawHtml(html: string) {
  assert.equal(html.toLowerCase().includes("<script"), false);
  assert.equal(html.toLowerCase().includes("<img"), false);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img/);
  assert.match(html, /onerror=alert\(1\)/);
}

test("post, autor e nome de produto saem como texto", () => {
  const article: PublicArticle = {
    title: payload,
    excerpt: payload,
    category: "Suplemento",
    authorName: payload,
    authorBio: payload,
    authorHref: null,
    blocks: [
      { id: "p", type: "paragrafo", text: payload },
      { id: "t", type: "titulo", text: payload },
      { id: "q", type: "citacao_lateral", text: payload, side: "esquerda" },
      { id: "i", type: "imagem", url: "", alt: payload, caption: payload },
      { id: "prod", type: "produto", productId: "caos-pre-treino" },
    ],
    products: [{ id: "caos-pre-treino", slug: "caos-pre-treino", name: payload, line: "Pré", hex: "#d6ff3c" }],
  };
  refusesRawHtml(htmlOf(createElement(Article, { article })));

  const product = getProduct("caos-pre-treino");
  assert.ok(product);
  refusesRawHtml(htmlOf(createElement(ProductCard, { product: { ...product, name: payload } })));
});

test("banner perigoso não vira link e o título não vira html", () => {
  for (const href of ["javascript:alert(1)", "data:text/html,hi", "http://pulso.dev", "//pulso.dev"]) {
    const html = htmlOf(createElement(BannerLink, { href }, payload));
    refusesRawHtml(html);
    assert.equal(html.includes("href="), false, href);
  }
  const https = htmlOf(createElement(BannerLink, { href: "https://pulso.dev/drop" }, "Drop"));
  assert.match(https, /href="https:\/\/pulso\.dev\/drop"/);
  const path = htmlOf(createElement(BannerLink, { href: "/loja" }, "Loja"));
  assert.match(path, /href="\/loja"/);
});
