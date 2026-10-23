import { AdminLoading, AdminShell } from "@/components/admin/shell";
import { loadAdminGate } from "@/server/admin-current";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";

async function Gate({ children }: { children: ReactNode }) {
  const gate = await loadAdminGate();
  if (gate.kind === "down") return <p className="px-6 py-16 text-sm text-muted-foreground">A API de login não respondeu.</p>;
  if (gate.kind !== "user") redirect("/admin/login");
  return <AdminShell session={{ user: gate.user }}>{children}</AdminShell>;
}

export default function AdminPanelLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}
