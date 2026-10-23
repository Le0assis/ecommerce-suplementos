import type { AdminDataSource } from "@/lib/admin-types";

export class AdminApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/admin/data/${path}`, {
      ...init,
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new AdminApiError(0, "Sem resposta do painel.");
  }
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new AdminApiError(response.status, body?.error ?? "Não deu para concluir.");
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
  if (file.size > 300 * 1024) {
    throw new AdminApiError(413, ticket.message ?? "Sem Blob, o adaptador aceita até 300 KB. Cole uma URL https ou reduza a imagem.");
  }
  const dataUrl = await readDataUrl(file);
  const saved = await adminFetch<{ source: AdminDataSource; url: string }>("uploads/local", {
    method: "POST",
    body: JSON.stringify({ alt: trimmed, dataUrl, contentType: file.type }),
  });
  return { url: saved.url, source: saved.source };
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new AdminApiError(400, "Não consegui ler a imagem."));
    reader.readAsDataURL(file);
  });
}
