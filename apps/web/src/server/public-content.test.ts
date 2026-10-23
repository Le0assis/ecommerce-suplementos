import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "vitest";
import { seedAdminDb } from "@/server/admin-seed";
import { listPublicAthletes, resolveArticle, resolveCollab } from "@/server/public-content";

const dirs: string[] = [];
const previous = process.env.ADMIN_MOCK_PATH;

afterEach(() => {
  if (previous === undefined) delete process.env.ADMIN_MOCK_PATH;
  else process.env.ADMIN_MOCK_PATH = previous;
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
