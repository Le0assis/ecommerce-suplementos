import type { AdminDataSource } from "@/lib/admin-types";

const ENDED_SESSION = new Set(["Sessão inválida ou vencida.", "Sessão expirada.", "Faça login para continuar."]);

export function isEndedAdminSession(message: string): boolean {
  return ENDED_SESSION.has(message);
}

export class AdminApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const FOREIGN_RECORD: Record<string, string> = {
  variacao_de_outro_produto: "Essa variação já pertence a outro produto. Remova a linha e crie outra.",
  imagem_de_outro_produto: "Essa foto já pertence a outro produto. Remova a foto e envie outra.",
};

export function adminErrorMessage(body: { error?: unknown; fields?: unknown; code?: unknown } | null, fallback = "Não deu para concluir."): string {
  if (typeof body?.code === "string" && FOREIGN_RECORD[body.code]) return FOREIGN_RECORD[body.code];
  const fields = body?.fields;
  if (fields && typeof fields === "object" && !Array.isArray(fields)) {
    const lines = Object.entries(fields as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
      .map(([key, message]) => `${key}: ${message}`);
    if (lines.length) return lines.join(" ");
  }
  return typeof body?.error === "string" && body.error ? body.error : fallback;
}

export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/admin/data/${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new AdminApiError(0, "Sem resposta do painel.");
  }
  const body = (await response.json().catch(() => null)) as { error?: string; fields?: Record<string, string> } | null;
  if (!response.ok) {
    const fallback = response.status === 403
      ? "Seu papel não faz isso."
      : response.status === 404
        ? "Não encontrado."
        : response.status === 409
          ? "Já existe um registro com esse identificador."
          : "Não deu para concluir.";
    const message = adminErrorMessage(body, fallback);
    if (isEndedAdminSession(message) && typeof window !== "undefined") {
      window.dispatchEvent(new Event("pulso-admin-session-end"));
    }
    throw new AdminApiError(response.status, message);
  }
  return body as T;
}

export async function uploadAdminImage(file: File, alt: string): Promise<{ url: string; source: AdminDataSource }> {
  const trimmed = alt.trim();
  if (!trimmed) throw new AdminApiError(400, "A foto precisa de texto alternativo.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new AdminApiError(400, "Use JPG, PNG ou WebP.");
  }
  const ticket = await adminFetch<{ source: AdminDataSource; mode?: string; uploadUrl?: string; publicUrl?: string; headers?: Record<string, string>; message?: string }>("uploads", {
    method: "POST",
    body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, alt: trimmed }),
  });
  if (ticket.uploadUrl && ticket.publicUrl) {
    const sent = await fetch(ticket.uploadUrl, { method: "PUT", headers: ticket.headers, body: file });
    if (!sent.ok) throw new AdminApiError(sent.status, "O armazenamento recusou a foto.");
    return { url: ticket.publicUrl, source: ticket.source };
  }
  throw new AdminApiError(502, ticket.message ?? "A API não devolveu o endereço de upload.");
}
