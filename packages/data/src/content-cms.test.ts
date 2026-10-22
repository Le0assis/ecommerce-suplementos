import { describe, expect, it } from "vitest";
import { applyContentPatches, cmsCatalog } from "./cms";
import { videos } from "./videos";

describe("conteúdo", () => {
  it("publica post, ugc e vídeo com transcrição", () => {
    const entries = cmsCatalog();
    expect(entries.some((entry) => entry.kind === "post" && entry.slug === "como-ler-rotulo")).toBe(true);
    expect(entries.some((entry) => entry.kind === "ugc")).toBe(true);
    expect(videos).toHaveLength(3);
    for (const video of videos) {
      expect(video.frames).toHaveLength(3);
      expect(video.transcript.length).toBeGreaterThan(0);
      expect(entries.find((entry) => entry.id === video.id)?.body).toContain(video.transcript[0]!);
    }
  });

  it("o patch esconde e renomeia sem apagar o original quando o patch some", () => {
    const [first] = cmsCatalog();
    expect(first).toBeTruthy();
    const hidden = applyContentPatches(cmsCatalog(), { [first!.id]: { hidden: true, title: "Rascunho" } });
    expect(hidden.some((entry) => entry.id === first!.id)).toBe(false);
    const renamed = applyContentPatches(cmsCatalog(), { [first!.id]: { title: "Título da redação" } });
    expect(renamed.find((entry) => entry.id === first!.id)?.title).toBe("Título da redação");
    expect(cmsCatalog().find((entry) => entry.id === first!.id)?.title).toBe(first!.title);
  });
});
