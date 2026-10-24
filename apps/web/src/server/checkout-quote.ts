import { CHECKOUT_QUOTE_PATH, heldQuoteResponse, onlyQuoteFields } from "@/lib/checkout-quote";

function apiBase(): string {
  return (process.env.API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
}

export async function forwardCheckoutQuote(body: unknown): Promise<{ status: number; body: unknown }> {
  const held = heldQuoteResponse();
  if (held) return held;
  const payload = onlyQuoteFields(body);
  if (!payload) return { status: 400, body: { error: "Informe slug, variant e qty." } };
  try {
    const response = await fetch(`${apiBase()}${CHECKOUT_QUOTE_PATH}`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const json = (await response.json().catch(() => null)) as unknown;
    if (!json || typeof json !== "object") return { status: response.status, body: { error: "A API não devolveu o resumo." } };
    return { status: response.status, body: json };
  } catch {
    return { status: 503, body: { error: "A API de checkout está fora do ar." } };
  }
}
