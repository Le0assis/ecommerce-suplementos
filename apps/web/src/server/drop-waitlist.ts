import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ORIGIN = "pagina_drops:v1";
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface WaitlistFile {
  entries: { dropId: string; email: string; consentOrigin: string; consentAt: string }[];
}

function filePath(): string {
  return process.env.DROP_WAITLIST_PATH ?? path.join(process.cwd(), ".data", "drop-waitlist.json");
}

function apiBase(): string {
  return (process.env.API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
}

function readFile(): WaitlistFile {
  try {
    const parsed = JSON.parse(readFileSync(/*turbopackIgnore: true*/ filePath(), "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as WaitlistFile).entries)) return { entries: [] };
    return { entries: (parsed as WaitlistFile).entries.filter((entry) => entry && typeof entry.email === "string" && typeof entry.dropId === "string") };
  } catch {
    return { entries: [] };
  }
}

function writeFile(data: WaitlistFile) {
  const file = filePath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(/*turbopackIgnore: true*/ file, JSON.stringify({ entries: data.entries.map((entry) => ({
    dropId: entry.dropId,
    email: entry.email,
    consentOrigin: entry.consentOrigin,
    consentAt: entry.consentAt,
  })) }));
}

export function waitlistCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of readFile().entries) counts[entry.dropId] = (counts[entry.dropId] ?? 0) + 1;
  return counts;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 320 || !EMAIL.test(email)) return null;
  return email;
}

function remember(dropId: string, email: string, consentAt: string): { already: boolean } {
  const data = readFile();
  if (data.entries.some((entry) => entry.dropId === dropId && entry.email === email)) return { already: true };
  data.entries.push({ dropId, email, consentOrigin: ORIGIN, consentAt });
  writeFile(data);
  return { already: false };
}

async function postApi(path: string, body: unknown): Promise<{ status: number; body: { error?: string; already?: boolean; ok?: boolean } } | null> {
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(800),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; already?: boolean; ok?: boolean };
    return { status: response.status, body: payload };
  } catch {
    return null;
  }
}

export async function joinDropWaitlist(dropId: string, input: { email?: unknown; consent?: unknown }, consentAt: string): Promise<{ status: number; body: { ok?: boolean; already?: boolean; error?: string; source?: string } }> {
  if (input.consent !== true) return { status: 400, body: { error: "O consentimento precisa ser explícito." } };
  const email = normalizeEmail(input.email);
  if (!email) return { status: 400, body: { error: "E-mail inválido." } };
  if (!dropId || dropId === "waitlist") return { status: 404, body: { error: "Drop não encontrado." } };
  const api = await postApi(`/v1/drops/${encodeURIComponent(dropId)}/waitlist`, { email, consent: true, consentOrigin: ORIGIN });
  if (api && api.status !== 503) {
    if (api.status >= 400) return { status: api.status, body: { error: api.body.error ?? "Não deu para entrar na lista." } };
    const local = remember(dropId, email, consentAt);
    return { status: api.status, body: { ok: true, already: api.body.already === true || local.already, source: "api" } };
  }
  const local = remember(dropId, email, consentAt);
  return { status: local.already ? 200 : 201, body: { ok: true, already: local.already, source: "adapter" } };
}

export async function eraseDropWaitlist(input: { email?: unknown }): Promise<{ status: number; body: { ok: true } }> {
  void input;
  return { status: 200, body: { ok: true } };
}
