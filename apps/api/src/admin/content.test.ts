import type { SqlClient } from "@pulso/db/sql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auth, createAdminApp, createTestDb, login, resetTables } from "./harness";

let sql: SqlClient;
let close: () => Promise<void>;

beforeAll(async () => {
  const db = await createTestDb();
  sql = db.sql;
  close = db.close;
});

afterAll(async () => {
  await close();
});

beforeEach(async () => {
  await resetTables(sql);
});

describe("autores, blocos e fotos do influencer", () => {
  it("publica frase e foto com cor de reserva, e arquiva o post", async () => {
    const app = createAdminApp(sql);
    const editor = await login(app, "editor@pulso.test", "senha-editor-pulso", "203.0.113.60");
    const headers = auth(editor.token, "203.0.113.60");
    const author = await app.request("/v1/admin/authors", {
      method: "POST",
      headers,
      body: JSON.stringify({ id: "redacao", name: "Redação PULSO", bio: "Textos da casa." }),
    });
    expect(author.status).toBe(201);
    const removedAuthor = await app.request("/v1/admin/authors/redacao", { method: "DELETE", headers });
    expect(removedAuthor.status).toBe(200);
    const restored = await app.request("/v1/admin/authors", {
      method: "POST",
      headers,
      body: JSON.stringify({ id: "redacao", name: "Redação PULSO", bio: "Textos da casa.", photoUrl: "https://cdn.pulso.test/autor.png" }),
    });
    expect(restored.status).toBe(201);
    const influencer = await app.request("/v1/admin/influencers", {
      method: "POST",
      headers,
      body: JSON.stringify({
        slug: "luna-teste",
        name: "Luna Teste",
        handle: "@lunateste",
        city: "São Paulo",
        sport: "Hyrox",
        bio: "Treina cedo.",
        story: "Três linhas de história da collab.",
        followers: "10 mil",
        accent: "#ff5cae",
        couponCode: "LUNA15",
        quotes: [{ body: "Sabor antes do shape." }],
        images: [{ url: null, alt: "Retrato em cor rosa", fallbackHex: "#ff5cae", caption: "Sem foto ainda" }],
      }),
    });
    expect(influencer.status).toBe(201);
    const card = await app.request("/v1/influencers/luna-teste");
    const body = await card.json();
    expect(body.source).toBe("postgres");
    expect(body.influencer.path).toBe("/atletas/luna-teste");
    expect(body.influencer.images[0]).toMatchObject({ url: null, fallbackHex: "#ff5cae", alt: "Retrato em cor rosa" });
    expect(body.influencer.quotes[0].body).toBe("Sabor antes do shape.");
    expect(body.influencer.story).toContain("história");
    const post = await app.request("/v1/admin/posts", {
      method: "POST",
      headers,
      body: JSON.stringify({
        slug: "collab-luna-teste",
        title: "Collab em teste",
        excerpt: "Um texto curto.",
        category: "Collab",
        authorId: "redacao",
        influencerId: "luna-teste",
        status: "publicado",
        publishedAt: "2026-10-01",
        readMinutes: 3,
        blocks: [
          { type: "paragrafo", text: "Suplemento alimentar não é medicamento." },
          { type: "citacao_lateral", text: "Sabor alto.", side: "esquerda" },
        ],
      }),
    });
    expect(post.status).toBe(201);
    const usedAuthor = await app.request("/v1/admin/authors/redacao", { method: "DELETE", headers });
    expect(usedAuthor.status).toBe(409);
    const draft = await app.request("/v1/admin/posts", {
      method: "POST",
      headers,
      body: JSON.stringify({
        slug: "rascunho-sem-data",
        title: "Ainda sem data",
        status: "rascunho",
        blocks: [{ type: "paragrafo", text: "Rascunho." }],
      }),
    });
    expect(draft.status).toBe(201);
    const draftRow = await sql.query<{ published_at: string | null }>("select published_at from posts where slug = 'rascunho-sem-data'");
    expect(draftRow.rows[0]?.published_at).toBeNull();
    const listed = await app.request("/v1/posts?influencer=luna-teste");
    const listedBody = await listed.json();
    expect(listedBody.source).toBe("postgres");
    const posts = listedBody.posts;
    expect(posts).toHaveLength(1);
    expect(posts[0].path).toBe("/blog/collab-luna-teste");
    expect(posts[0].author).toBe("Redação PULSO");
    expect(posts[0].authorSlug).toBe("redacao");
    expect(posts[0].authorAvatar).toBe("https://cdn.pulso.test/autor.png");
    expect(posts[0].authorBio).toBe("Textos da casa.");
    expect(posts[0].body).toEqual(["Suplemento alimentar não é medicamento."]);
    expect(posts[0].blocks).toHaveLength(2);
    const archived = await app.request("/v1/admin/posts/collab-luna-teste", { method: "DELETE", headers });
    expect((await archived.json()).item.status).toBe("arquivado");
    const after = await app.request("/v1/posts?influencer=luna-teste");
    expect((await after.json()).posts).toHaveLength(0);
    const support = await login(app, "atendimento@pulso.test", "senha-atendimento", "203.0.113.61");
    const blocked = await app.request("/v1/admin/posts", {
      method: "POST",
      headers: auth(support.token, "203.0.113.61"),
      body: JSON.stringify({ slug: "nao", title: "Não", blocks: [] }),
    });
    expect(blocked.status).toBe(403);
  });
});
