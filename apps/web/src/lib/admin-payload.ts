import { slugify } from "@/lib/admin-types";

/** Tira `id` vazio em qualquer nível. A API trata `id` como opcional, mas `""` falha no min(1). */
export function omitEmptyIds<T>(value: T): T {
  return strip(value) as T;
}

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => strip(item));
  if (!value || typeof value !== "object") return value;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === "id" && (item === "" || item === null || item === undefined)) continue;
    next[key] = strip(item);
  }
  return next;
}

function withSuffix(root: string, n: number): string {
  const tail = `-${n}`;
  return `${root.slice(0, Math.max(1, 80 - tail.length))}${tail}`;
}

/** Slug só do texto informado. Se já existir, acrescenta -2, -3… sem colar o nome de novo. */
export function uniqueSlug(base: string, taken: Iterable<string>, current?: string): string {
  const root = slugify(base).slice(0, 80) || "item";
  const keep = current ? slugify(current) : "";
  const used = new Set<string>();
  for (const item of taken) {
    const slug = slugify(item);
    if (slug && slug !== keep) used.add(slug);
  }
  if (!used.has(root)) return root;
  let n = 2;
  while (used.has(withSuffix(root, n))) n += 1;
  return withSuffix(root, n);
}

/** Aviso quando o slug gravado ganhou sufixo porque o pedido já existia. */
export function slugTakenNotice(base: string, finalSlug: string): string | null {
  const asked = slugify(base).slice(0, 80) || "item";
  if (!finalSlug || finalSlug === asked) return null;
  return `Esse slug já existe. O slug final é ${finalSlug}.`;
}

/** No criar, sufixo -2 fica explícito. No editar, o slug não muda sozinho. */
export function resolveSlug(input: {
  base: string;
  typed: string;
  taken: Iterable<string>;
  isNew: boolean;
  current?: string;
}): { slug: string; notice: string | null } {
  const source = input.typed.trim() || input.base;
  const slug = input.isNew ? uniqueSlug(source, input.taken) : slugify(source);
  if (!input.isNew) return { slug, notice: null };
  const auto = uniqueSlug(input.base, input.taken, input.current);
  const typed = input.typed.trim();
  const intended = !typed || typed === slugify(input.base) || typed === auto ? input.base : typed;
  return { slug, notice: slugTakenNotice(intended, slug) };
}
