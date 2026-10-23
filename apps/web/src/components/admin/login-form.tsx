"use client";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const response = await fetch("/api/admin/session", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (response.status === 429) {
      setError(body.error ?? "Muitas tentativas de login. Espera alguns minutos.");
      return;
    }
    if (!response.ok) {
      setError(body.error ?? "Não foi possível entrar.");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-16">
      <Logo />
      <h1 className="mt-6 font-display text-6xl leading-none">Admin</h1>
      <p className="mt-2 text-sm text-muted-foreground">Use o e-mail e a senha da conta criada no servidor. O navegador só recebe o cookie httpOnly.</p>
      <form className="mt-6 space-y-3" onSubmit={(event) => void submit(event)}>
        <label className="block text-sm">
          <span className="mb-1.5 block text-muted-foreground">E-mail</span>
          <Input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-muted-foreground">Senha</span>
          <Input type="password" autoComplete="current-password" aria-label="Senha do admin" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {error ? <p className="text-sm text-pink" role="alert">{error}</p> : null}
        <Button type="submit" className="rounded-full" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</Button>
      </form>
    </main>
  );
}
