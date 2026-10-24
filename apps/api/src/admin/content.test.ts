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

  it("esconde rascunho, arquivo e agendado futuro e zera capa que não é https", async () => {
    const app = createAdminApp(sql);
    const editor = await login(app, "editor@pulso.test", "senha-editor-pulso", "203.0.113.70");
    const headers = auth(editor.token, "203.0.113.70");
    const create = (body: Record<string, unknown>) =>
      app.request("/v1/admin/posts", { method: "POST", headers, body: JSON.stringify(body) });
    expect((await create({
      slug: "capa-ok",
      title: "Capa ok",
      status: "publicado",
      publishedAt: "2026-10-01",
      coverUrl: "https://cdn.pulso.test/capa.jpg",
      seoTitle: "Segredo de busca",
      seoDescription: "Não listar",
      shareImageUrl: "https://cdn.pulso.test/share.jpg",
      blocks: [
        { type: "paragrafo", text: "Texto." },
        { type: "imagem", url: "https://cdn.pulso.test/bloco.jpg", alt: "Bloco", caption: "" },
      ],
    })).status).toBe(201);
    expect((await create({ slug: "ainda-rascunho", title: "Rascunho", status: "rascunho", coverUrl: "https://cdn.pulso.test/rascunho.jpg", blocks: [{ type: "paragrafo", text: "Fora." }] })).status).toBe(201);
    expect((await create({ slug: "futuro", title: "Futuro", status: "agendado", publishedAt: "2099-01-01", coverUrl: "https://cdn.pulso.test/futuro.jpg", blocks: [{ type: "paragrafo", text: "Ainda não." }] })).status).toBe(201);
    expect((await create({ slug: "ja-saiu", title: "Já saiu", status: "agendado", publishedAt: "2020-01-01", blocks: [{ type: "paragrafo", text: "No ar." }] })).status).toBe(201);
    expect((await create({ slug: "arquivo", title: "Arquivo", status: "arquivado", publishedAt: "2020-01-01", blocks: [] })).status).toBe(201);

    const listed = await (await app.request("/v1/posts")).json();
    const slugs = listed.posts.map((item: { slug: string }) => item.slug);
    expect(slugs).toEqual(expect.arrayContaining(["capa-ok", "ja-saiu"]));
    for (const hidden of ["ainda-rascunho", "futuro", "arquivo"]) {
      expect(slugs).not.toContain(hidden);
      expect((await app.request(`/v1/posts/${hidden}`)).status).toBe(404);
    }
    const live = listed.posts.find((item: { slug: string }) => item.slug === "capa-ok");
    expect(live.coverUrl).toBe("https://cdn.pulso.test/capa.jpg");
    expect(live.blocks.find((block: { type: string }) => block.type === "imagem").url).toBe("https://cdn.pulso.test/bloco.jpg");
    for (const field of ["status", "seoTitle", "seoDescription", "shareImageUrl", "payload"]) {
      expect(live).not.toHaveProperty(field);
    }

    await sql.query("update posts set cover_url = $1 where slug = 'capa-ok'", ["javascript:alert(1)"]);
    await sql.query(
      "update post_blocks set content = jsonb_set(content, '{url}', $1::jsonb) where post_id = 'capa-ok' and type = 'imagem'",
      [JSON.stringify("data:text/html,hi")],
    );
    const detail = await (await app.request("/v1/posts/capa-ok")).json();
    expect(detail.post.coverUrl).toBeNull();
    expect(detail.post.blocks.find((block: { type: string }) => block.type === "imagem").url).toBeNull();
    expect(detail.post).not.toHaveProperty("seoTitle");
    expect(detail.post).not.toHaveProperty("shareImageUrl");
    const admin = await (await app.request("/v1/admin/posts/capa-ok", { headers })).json();
    expect(admin.item.coverUrl).toBe("javascript:alert(1)");
    expect(admin.item.seoTitle).toBe("Segredo de busca");
  });

  it("abre e atualiza influencer, autor e post pelo id, com 404 e 409", async () => {
    const app = createAdminApp(sql);
    const editor = await login(app, "editor@pulso.test", "senha-editor-pulso", "203.0.113.62");
    const headers = auth(editor.token, "203.0.113.62");
    const missing = await app.request("/v1/admin/posts/nao-existe", { headers });
    expect(missing.status).toBe(404);
    const author = await app.request("/v1/admin/authors", {
      method: "POST",
      headers,
      body: JSON.stringify({ id: "casa", name: "Casa", bio: "Bio curta." }),
    });
    expect(author.status).toBe(201);
    const authorAgain = await app.request("/v1/admin/authors", {
      method: "POST",
      headers,
      body: JSON.stringify({ id: "casa", name: "Outra" }),
    });
    expect(authorAgain.status).toBe(409);
    const authorPatch = await app.request("/v1/admin/authors/casa", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ id: "casa", name: "Casa PULSO", bio: "Bio nova." }),
    });
    expect(authorPatch.status).toBe(200);
    expect((await authorPatch.json()).item).toMatchObject({ id: "casa", name: "Casa PULSO", bio: "Bio nova." });
    const moved = await app.request("/v1/admin/authors/casa", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ id: "outro", name: "Casa" }),
    });
    expect(moved.status).toBe(409);
    const influencer = await app.request("/v1/admin/influencers", {
      method: "POST",
      headers,
      body: JSON.stringify({ slug: "luna-ficha", name: "Luna Ficha", handle: "@lunaficha", accent: "#ff5cae" }),
    });
    expect(influencer.status).toBe(201);
    const one = await app.request("/v1/admin/influencers/luna-ficha", { headers });
    expect(one.status).toBe(200);
    const patched = await app.request("/v1/admin/influencers/luna-ficha", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ slug: "luna-ficha", name: "Luna Atualizada", handle: "@lunaficha", accent: "#101012", bio: "Nova bio." }),
    });
    expect(patched.status).toBe(200);
    expect((await patched.json()).item.name).toBe("Luna Atualizada");
    const duplicate = await app.request("/v1/admin/influencers", {
      method: "POST",
      headers,
      body: JSON.stringify({ slug: "luna-ficha", name: "Outra", handle: "@outra", accent: "#ff5cae" }),
    });
    expect(duplicate.status).toBe(409);
    const post = await app.request("/v1/admin/posts", {
      method: "POST",
      headers,
      body: JSON.stringify({
        slug: "ficha-aberta",
        title: "Ficha",
        authorId: "casa",
        status: "rascunho",
        blocks: [{ type: "paragrafo", text: "Primeira versão." }],
      }),
    });
    expect(post.status).toBe(201);
    const opened = await app.request("/v1/admin/posts/ficha-aberta", { headers });
    expect(opened.status).toBe(200);
    expect((await opened.json()).item).toMatchObject({ id: "ficha-aberta", slug: "ficha-aberta", title: "Ficha" });
    const updated = await app.request("/v1/admin/posts/ficha-aberta", {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        slug: "ficha-aberta",
        title: "Ficha atualizada",
        publishedAt: "2026-10-23T15:00:00-03:00",
        status: "publicado",
        blocks: [{ type: "paragrafo", text: "Segunda versão." }],
      }),
    });
    expect(updated.status).toBe(200);
    expect((await updated.json()).item).toMatchObject({ title: "Ficha atualizada", publishedAt: "2026-10-23" });
    const slugChange = await app.request("/v1/admin/posts/ficha-aberta", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ slug: "outro-slug", title: "Não", blocks: [{ type: "paragrafo", text: "Não." }] }),
    });
    expect(slugChange.status).toBe(409);
    const again = await app.request("/v1/admin/posts", {
      method: "POST",
      headers,
      body: JSON.stringify({ slug: "ficha-aberta", title: "De novo", blocks: [] }),
    });
    expect(again.status).toBe(409);
    const audit = await sql.query("select action from audit_log where entity = 'post' and entity_id = 'ficha-aberta' order by created_at");
    expect(audit.rows.map((row) => row.action)).toEqual(["post.save", "post.update"]);
    const support = await login(app, "atendimento@pulso.test", "senha-atendimento", "203.0.113.63");
    const denied = await app.request("/v1/admin/posts/ficha-aberta", { headers: auth(support.token, "203.0.113.63") });
    expect(denied.status).toBe(403);
  });

  it("desfaz o post inteiro quando o id do bloco colide e aceita o mesmo uuid em outro post", async () => {
    const app = createAdminApp(sql);
    const editor = await login(app, "editor@pulso.test", "senha-editor-pulso", "203.0.113.64");
    const headers = auth(editor.token, "203.0.113.64");
    const blockId = "6f1e8c2a-9b34-4d5e-8f70-1a2b3c4d5e6f";
    const created = await app.request("/v1/admin/posts", {
      method: "POST",
      headers,
      body: JSON.stringify({
        slug: "texto-antigo",
        title: "Versão antiga",
        status: "rascunho",
        blocks: [{ id: blockId, type: "paragrafo", text: "Corpo antigo." }],
      }),
    });
    expect(created.status).toBe(201);
    expect((await created.json()).item.blocks).toEqual([{ id: blockId, type: "paragrafo", text: "Corpo antigo." }]);
    const collision = await app.request("/v1/admin/posts/texto-antigo", {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        slug: "texto-antigo",
        title: "Versão que não pode ficar",
        status: "publicado",
        publishedAt: "2026-10-23",
        blocks: [
          { id: blockId, type: "paragrafo", text: "Corpo novo." },
          { id: blockId, type: "paragrafo", text: "Id repetido." },
        ],
      }),
    });
    expect(collision.status).toBe(409);
    const kept = await app.request("/v1/admin/posts/texto-antigo", { headers });
    expect((await kept.json()).item).toMatchObject({
      title: "Versão antiga",
      status: "rascunho",
      blocks: [{ id: blockId, type: "paragrafo", text: "Corpo antigo." }],
    });
    const row = await sql.query<{ title: string; status: string }>("select title, status from posts where slug = 'texto-antigo'");
    expect(row.rows[0]).toEqual({ title: "Versão antiga", status: "rascunho" });
    const blocks = await sql.query<{ id: string }>("select id from post_blocks where post_id = 'texto-antigo' order by position");
    expect(blocks.rows.map((item) => item.id)).toEqual([blockId]);
    const other = await app.request("/v1/admin/posts", {
      method: "POST",
      headers,
      body: JSON.stringify({
        slug: "outro-texto",
        title: "Outro post",
        status: "rascunho",
        blocks: [{ id: blockId, type: "paragrafo", text: "Mesmo uuid, outro post." }],
      }),
    });
    expect(other.status).toBe(201);
    expect((await other.json()).item.blocks[0]).toMatchObject({ id: blockId, text: "Mesmo uuid, outro post." });
    const still = await sql.query<{ title: string }>("select title from posts where slug = 'texto-antigo'");
    expect(still.rows[0]?.title).toBe("Versão antiga");
    const both = await sql.query<{ post_id: string }>("select post_id from post_blocks where id = $1 order by post_id", [blockId]);
    expect(both.rows.map((item) => item.post_id)).toEqual(["outro-texto", "texto-antigo"]);
  });
});
