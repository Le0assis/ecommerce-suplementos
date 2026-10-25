const ORIGIN = "pagina_drops:v1";
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function apiBase(): string {
  return (process.env.API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 320 || !EMAIL.test(email)) return null;
  return email;
}

async function postApi(path: string, body: unknown): Promise<{ status: number; body: { error?: string; ok?: boolean } } | null> {
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(800),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; ok?: boolean };
    return { status: response.status, body: payload };
  } catch {
    return null;
  }
}

export async function joinDropWaitlist(dropId: string, input: { email?: unknown; consent?: unknown }): Promise<{ status: number; body: { ok?: boolean; error?: string } }> {
  if (input.consent !== true) return { status: 400, body: { error: "O consentimento precisa ser explícito." } };
  const email = normalizeEmail(input.email);
  if (!email) return { status: 400, body: { error: "E-mail inválido." } };
  if (!dropId || dropId === "waitlist") return { status: 404, body: { error: "Drop não encontrado." } };
  const api = await postApi(`/v1/drops/${encodeURIComponent(dropId)}/waitlist`, { email, consent: true, consentOrigin: ORIGIN });
  if (!api) return { status: 503, body: { error: "Não deu para entrar na lista." } };
  if (api.status >= 400) return { status: api.status, body: { error: api.body.error ?? "Não deu para entrar na lista." } };
  return { status: 200, body: { ok: true } };
}

export async function eraseDropWaitlist(input: { email?: unknown }): Promise<{ status: number; body: { error: string } }> {
  void input;
  return { status: 410, body: { error: "A saída da lista é só pelo atendimento." } };
}
