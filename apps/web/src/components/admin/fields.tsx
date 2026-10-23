"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseBRLToCents } from "@pulso/domain";
import type { ReactNode } from "react";
import { useState } from "react";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function TextArea({ label, value, onChange, rows = 4 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return (
    <Field label={label}>
      <textarea
        aria-label={label}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </Field>
  );
}

export function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <Field label={label}>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
      >
        {children}
      </select>
    </Field>
  );
}

export function MoneyField({ label, cents, onChange }: { label: string; cents: number; onChange: (cents: number) => void }) {
  const [text, setText] = useState(() => (cents / 100).toFixed(2).replace(".", ","));
  return (
    <Field label={label}>
      <Input
        aria-label={label}
        inputMode="decimal"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          const parsed = parseBRLToCents(text);
          if (parsed === null) {
            setText((cents / 100).toFixed(2).replace(".", ","));
            return;
          }
          onChange(parsed);
          setText((parsed / 100).toFixed(2).replace(".", ","));
        }}
      />
    </Field>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-[1.4rem] border border-white/10 bg-card/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-3xl leading-none">{title}</h2>
        {action}
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

export function Notice({ tone, children }: { tone: "ok" | "warn" | "error"; children: ReactNode }) {
  const color = tone === "ok" ? "text-lime" : tone === "error" ? "text-pink" : "text-muted-foreground";
  return (
    <p className={`text-sm ${color}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone = status === "publicado" ? "bg-lime text-primary-foreground" : status === "arquivado" || status === "oculto" ? "bg-pink text-white" : "bg-white/10 text-foreground";
  return <span className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${tone}`}>{status}</span>;
}

export function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <Label className="flex items-center gap-2 text-sm font-normal">
      <input type="checkbox" className="accent-lime" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </Label>
  );
}
