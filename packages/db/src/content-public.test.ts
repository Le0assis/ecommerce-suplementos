import { describe, expect, it } from "vitest";
import { isPublicPost, toPublicPost, type AuthorRow, type PostAdmin } from "./content";

function post(overrides: Partial<PostAdmin> = {}): PostAdmin {
  return {
    id: "capa",
    slug: "capa",
    title: "Capa",
    excerpt: "Curto",
    category: "Collab",
    coverUrl: "https://cdn.pulso.test/capa.jpg",
    coverHex: "#d6ff3c",
    authorId: "redacao",
    influencerId: "luna",
    status: "publicado",
    publishedAt: "2026-10-01",
    readMinutes: 3,
    seoTitle: "Título de busca",
    seoDescription: "Descrição interna",
    shareImageUrl: "https://cdn.pulso.test/share.jpg",
    blocks: [
      { id: "p", type: "paragrafo", text: "Texto." },
      { id: "i", type: "imagem", url: "https://cdn.pulso.test/bloco.jpg", alt: "Bloco", caption: "" },
    ],
    ...overrides,
  };
}

const author: AuthorRow = {
  id: "redacao",
  name: "Redação PULSO",
  photoUrl: "https://cdn.pulso.test/autor.png",
  bio: "Textos da casa.",
  influencerId: null,
};

describe("post público", () => {
  it("mantém https e caminho, e zera URL perigosa na capa, na foto e no autor", () => {
    const safe = toPublicPost(post(), author);
    expect(safe.coverUrl).toBe("https://cdn.pulso.test/capa.jpg");
    expect(safe.authorAvatar).toBe("https://cdn.pulso.test/autor.png");
    expect(safe.blocks.find((block) => block.type === "imagem")).toMatchObject({ url: "https://cdn.pulso.test/bloco.jpg" });
    expect(safe).not.toHaveProperty("status");
    expect(safe).not.toHaveProperty("seoTitle");
    expect(safe).not.toHaveProperty("seoDescription");
    expect(safe).not.toHaveProperty("shareImageUrl");
    expect(safe).not.toHaveProperty("id");
    expect(toPublicPost(post({ coverUrl: "  /fotos/capa.jpg  " })).coverUrl).toBe("/fotos/capa.jpg");

    for (const coverUrl of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,hi", "http://pulso.dev/capa.jpg", "//cdn.pulso.test/capa.jpg", "https:alert(1)", "/\\capa.jpg", "https://cdn.pulso.test/\u0000capa.jpg", ""]) {
      const published = toPublicPost(
        post({
          coverUrl,
          blocks: [{ id: "i", type: "imagem", url: coverUrl, alt: "Bloco", caption: "" }],
        }),
        { ...author, photoUrl: coverUrl },
      );
      expect(published.coverUrl, coverUrl).toBeNull();
      expect(published.authorAvatar, coverUrl).toBeNull();
      expect(published.blocks[0]).toMatchObject({ type: "imagem", url: null });
    }
  });

  it("só considera publicado, ou agendado até hoje", () => {
    const now = new Date("2026-10-24T15:00:00.000Z");
    expect(isPublicPost(post({ status: "publicado", publishedAt: "2099-01-01" }), now)).toBe(true);
    expect(isPublicPost(post({ status: "agendado", publishedAt: "2026-10-24" }), now)).toBe(true);
    expect(isPublicPost(post({ status: "agendado", publishedAt: "2020-01-01" }), now)).toBe(true);
    expect(isPublicPost(post({ status: "agendado", publishedAt: "2026-10-25" }), now)).toBe(false);
    expect(isPublicPost(post({ status: "agendado", publishedAt: null }), now)).toBe(false);
    expect(isPublicPost(post({ status: "rascunho", publishedAt: "2020-01-01" }), now)).toBe(false);
    expect(isPublicPost(post({ status: "arquivado", publishedAt: "2020-01-01" }), now)).toBe(false);
  });
});
