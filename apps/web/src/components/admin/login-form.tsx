"use client";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

function retryLabel(raw: number | string | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds >= 60) return `Tente de novo em ${Math.ceil(seconds / 60)} min.`;
  return `Tente de novo em ${Math.ceil(seconds)} s.`;
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    let response: Response;
    try {
      response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      setPending(false);
      setError("A API de admin está fora do ar.");
      return;
    }
    const body = (await response.json().catch(() => ({}))) as { error?: string; retryAfter?: number | string };
    setPending(false);
    if (!response.ok) {
      const raw = body.retryAfter ?? response.headers.get("retry-after");
      const wait = retryLabel(raw);
      const message = body.error ?? "Não foi possível entrar.";
      setError(wait ? `${message} ${wait}` : message);
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-16">
      <Logo />
      <h1 className="mt-6 font-display text-6xl leading-none">Admin</h1>
      <p className="mt-2 text-sm text-muted-foreground">Conta da API: dono, editor ou atendimento. O navegador só recebe um cookie httpOnly.</p>
      <form className="mt-6 space-y-3" onSubmit={(event) => void submit(event)}>
        <label className="block text-sm">
          <span className="mb-1.5 block text-muted-foreground">E-mail</span>
          <Input type="email" autoComplete="username" placeholder="dono@pulso.local" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={pending} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-muted-foreground">Senha</span>
          <Input type="password" autoComplete="current-password" aria-label="Senha do admin" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={pending} />
        </label>
        {error ? <p className="text-sm text-pink" role="alert">{error}</p> : null}
        <Button type="submit" className="rounded-full" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</Button>
      </form>
    </main>
  );
}
