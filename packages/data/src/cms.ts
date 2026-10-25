import { posts, ugc } from "./content";
import { videos } from "./videos";

export interface CmsEntry {
  id: string;
  kind: "post" | "ugc" | "video";
  slug: string;
  title: string;
  body: string;
  hidden?: boolean;
}

export interface ContentPatch {
  title?: string;
  body?: string;
  hidden?: boolean;
}

export function cmsCatalog(): CmsEntry[] {
  return [
    ...posts.map((post) => ({
      id: post.slug,
      kind: "post" as const,
      slug: post.slug,
      title: post.title,
      body: post.body.join("\n\n"),
    })),
    ...ugc.map((post) => ({
      id: post.id,
      kind: "ugc" as const,
      slug: post.id,
      title: post.caption,
      body: `${post.handle} · ${post.likes} curtidas`,
    })),
    ...videos.map((video) => ({
      id: video.id,
      kind: "video" as const,
      slug: video.slug,
      title: video.title,
      body: video.transcript.join(" "),
    })),
  ];
}

export function applyContentPatches(entries: CmsEntry[], patches: Record<string, ContentPatch> = {}): CmsEntry[] {
  return entries
    .map((entry) => {
      const patch = patches[entry.id];
      if (!patch) return entry;
      const title = patch.title?.trim();
      const body = patch.body?.trim();
      return {
        ...entry,
        title: title || entry.title,
        body: body || entry.body,
        hidden: patch.hidden ?? entry.hidden,
      };
    })
    .filter((entry) => !entry.hidden);
}
