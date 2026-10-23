import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "vitest";
import { seedAdminDb } from "@/server/admin-seed";
import { listPublicAthletes, loadPublicArticle, loadPublicAthletes, loadPublicCollab, loadPublicPosts, resolveArticle, resolveCollab } from "@/server/public-content";

const dirs: string[] = [];
const previous = process.env.ADMIN_MOCK_PATH;
const previousApi = process.env.API_URL;
const previousFetch = globalThis.fetch;

afterEach(() => {
  if (previous === undefined) delete process.env.ADMIN_MOCK_PATH;
  else process.env.ADMIN_MOCK_PATH = previous;
  if (previousApi === undefined) delete process.env.API_URL;
  else process.env.API_URL = previousApi;
  globalThis.fetch = previousFetch;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function useFile(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "pulso-public-"));
  dirs.push(dir);
  const file = path.join(dir, name);
  process.env.ADMIN_MOCK_PATH = file;
  return file;
}

test("sem arquivo a collab usa o catálogo e não inventa frase", () => {
  useFile("ausente.json");
  const page = resolveCollab("luna-vaz", Date.parse("2026-10-23T12:00:00-03:00"));
  assert.ok(page);
  assert.equal(page.name, "Luna Vaz");
  assert.equal(page.story, "");
  assert.equal(page.quotes.length, 0);
  assert.equal(page.images.length, 0);
  assert.equal(page.products.some((product) => product.slug === "collab-luna"), true);
  assert.equal(page.instagramUrl, "https://instagram.com/lunavaz");
});

test("a collab lê história, quatro frases e a foto do adaptador", () => {
  const file = useFile("admin-mock.json");
  const db = seedAdminDb();
  const luna = db.influencers.find((person) => person.slug === "luna-vaz");
  assert.ok(luna);
  luna.story = "Treina cedo e fala do sabor, sem promessa.";
  luna.quotes = [1, 2, 3, 4, 5].map((position) => ({ id: `q${position}`, body: `Frase ${position}`, position }));
  luna.images = [{ id: "foto", url: null, alt: "Retrato", caption: "Treino", instagramPostUrl: "https://instagram.com/p/demo", fallbackHex: "#ff5cae", position: 0 }];
  luna.active = true;
  writeFileSync(file, JSON.stringify(db));
  const page = resolveCollab("luna-vaz", Date.parse("2026-10-23T12:00:00-03:00"));
  assert.ok(page);
  assert.equal(page.story, "Treina cedo e fala do sabor, sem promessa.");
  assert.deepEqual(page.quotes.map((quote) => quote.body), ["Frase 1", "Frase 2", "Frase 3", "Frase 4"]);
  assert.equal(page.images[0]?.alt, "Retrato");
  assert.equal(page.images[0]?.href, "https://instagram.com/p/demo");
  assert.equal(page.images[0]?.url, null);
});

test("influencer criado no adaptador abre em /atletas", () => {
  const file = useFile("admin-mock.json");
  const db = seedAdminDb();
  const base = db.influencers[0];
  assert.ok(base);
  db.influencers.push({
    ...base,
    id: "nova-collab",
    slug: "nova-collab",
    name: "Nova Collab",
    handle: "@nova",
    active: true,
    story: "Entrou pelo admin.",
    quotes: [],
    images: [],
    productIds: [],
  });
  writeFileSync(file, JSON.stringify(db));
  const card = listPublicAthletes().find((item) => item.slug === "nova-collab");
  assert.equal(card?.path, "/atletas/nova-collab");
  const page = resolveCollab("nova-collab", Date.parse("2026-10-23T12:00:00-03:00"));
  assert.equal(page?.name, "Nova Collab");
  assert.equal(page?.story, "Entrou pelo admin.");
});

test("influencer inativo some da collab e post arquivado some do blog", () => {
  const file = useFile("admin-mock.json");
  const db = seedAdminDb();
  const luna = db.influencers.find((person) => person.slug === "luna-vaz");
  const post = db.posts.find((item) => item.slug === "pre-sem-passar-mal");
  assert.ok(luna && post);
  luna.active = false;
  post.status = "arquivado";
  writeFileSync(file, JSON.stringify(db));
  const now = Date.parse("2026-10-23T12:00:00-03:00");
  assert.equal(resolveCollab("luna-vaz", now), null);
  assert.equal(resolveArticle("pre-sem-passar-mal", now), null);
});

test("post publicado no adaptador troca o parágrafo por bloco e liga o autor", () => {
  const file = useFile("admin-mock.json");
  const db = seedAdminDb();
  const post = db.posts.find((item) => item.slug === "pre-sem-passar-mal");
  const author = db.authors.find((item) => item.id === "redacao-pulso");
  assert.ok(post && author);
  author.bio = "Textos da bancada.";
  author.influencerId = "luna-vaz";
  post.blocks = [
    { id: "t1", type: "titulo", text: "Meia dose" },
    { id: "p1", type: "paragrafo", text: "Começa com metade do dosador." },
  ];
  post.status = "publicado";
  post.publishedAt = "2026-09-12T12:00:00-03:00";
  writeFileSync(file, JSON.stringify(db));
  const article = resolveArticle("pre-sem-passar-mal", Date.parse("2026-10-23T12:00:00-03:00"));
  assert.ok(article);
  assert.equal(article.blocks[0]?.type, "titulo");
  assert.equal(article.authorBio, "Textos da bancada.");
  assert.equal(article.authorHref, "/atletas/luna-vaz");
});

test("a vitrine lê influencer e post da API e ignora o arquivo", async () => {
  const file = useFile("admin-mock.json");
  const db = seedAdminDb();
  const post = db.posts.find((item) => item.slug === "pre-sem-passar-mal");
  assert.ok(post);
  post.blocks = [{ id: "t1", type: "titulo", text: "Só no arquivo" }];
  post.status = "publicado";
  post.publishedAt = "2026-09-12T12:00:00-03:00";
  const base = db.influencers[0];
  assert.ok(base);
  db.influencers.push({
    ...base,
    id: "so-arquivo",
    slug: "so-arquivo",
    name: "Só Arquivo",
    handle: "@arquivo",
    active: true,
  });
  writeFileSync(file, JSON.stringify(db));
  process.env.API_URL = "http://pulso.test";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/v1/influencers/nova-api")) {
      return Response.json({
        source: "mock",
        influencer: {
          slug: "nova-api",
          name: "Nova API",
          handle: "@nova",
          city: "Recife",
          story: "Veio da API.",
          quotes: [],
          images: [{ id: "f", url: null, alt: "Retrato", instagramPostUrl: "javascript:alert(1)" }],
          accent: "#d6ff3c",
        },
      });
    }
    if (url.endsWith("/v1/influencers")) {
      return Response.json({
        source: "mock",
        influencers: [{ slug: "nova-api", name: "Nova API", handle: "@nova", city: "Recife", accent: "#d6ff3c" }],
      });
    }
    if (url.includes("/v1/posts/texto-api")) {
      return Response.json({
        source: "mock",
        post: {
          slug: "texto-api",
          title: "Texto da API",
          excerpt: "Curto",
          category: "Collab",
          author: "Redação",
          authorBio: "Bio da API.",
          authorSlug: "redacao",
          authorAvatar: null,
          blocks: [{ id: "p1", type: "paragrafo", text: "Parágrafo da API." }],
        },
      });
    }
    if (url.includes("/v1/posts/pre-sem-passar-mal") || url.includes("/v1/influencers/so-arquivo")) {
      return new Response(JSON.stringify({ error: "não" }), { status: 404 });
    }
    if (url.includes("/v1/posts")) {
      return Response.json({
        source: "mock",
        posts: [{ slug: "texto-api", title: "Texto da API", excerpt: "Curto", category: "Collab", readMinutes: 2, publishedAt: "2026-10-01" }],
      });
    }
    return new Response("no", { status: 404 });
  };

  const cards = await loadPublicAthletes();
  assert.equal(cards.some((card) => card.slug === "nova-api"), true);
  assert.equal(cards.some((card) => card.slug === "so-arquivo"), false);
  assert.equal(cards.some((card) => card.slug === "luna-vaz"), false);
  const page = await loadPublicCollab("nova-api");
  assert.equal(page?.story, "Veio da API.");
  assert.equal(page?.images[0]?.href, null);
  assert.equal(page?.instagramUrl, "https://instagram.com/nova");
  const posts = await loadPublicPosts();
  assert.equal(posts[0]?.path, "/blog/texto-api");
  const article = await loadPublicArticle("texto-api");
  assert.equal(article?.blocks[0]?.type, "paragrafo");
  assert.equal(article?.authorName, "Redação");
  assert.equal(article?.authorBio, "Bio da API.");
  assert.equal(await loadPublicArticle("pre-sem-passar-mal"), null);
  assert.equal(await loadPublicCollab("so-arquivo"), null);
});

test("sem API a vitrine volta ao catálogo e não ao arquivo", async () => {
  const file = useFile("admin-mock.json");
  const db = seedAdminDb();
  const post = db.posts.find((item) => item.slug === "pre-sem-passar-mal");
  const base = db.influencers[0];
  assert.ok(post && base);
  post.blocks = [{ id: "t1", type: "titulo", text: "Só no arquivo" }];
  post.status = "publicado";
  post.publishedAt = "2026-09-12T12:00:00-03:00";
  db.influencers.push({ ...base, id: "so-arquivo", slug: "so-arquivo", name: "Só Arquivo", handle: "@arquivo", active: true });
  writeFileSync(file, JSON.stringify(db));
  process.env.API_URL = "http://127.0.0.1:9";
  const cards = await loadPublicAthletes();
  assert.equal(cards.some((card) => card.slug === "so-arquivo"), false);
  assert.equal(cards.some((card) => card.slug === "luna-vaz"), true);
  const article = await loadPublicArticle("pre-sem-passar-mal");
  assert.equal(article?.blocks[0]?.type, "paragrafo");
  assert.equal(await loadPublicCollab("so-arquivo"), null);
});
