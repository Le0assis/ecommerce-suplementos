import { AdminLoading, AdminShell } from "@/components/admin/shell";
import { currentAdminView } from "@/server/admin-current";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";

async function Gate({ children }: { children: ReactNode }) {
  await connection();
  const session = await currentAdminView();
  if (!session) redirect("/admin/login");
  return <AdminShell session={session}>{children}</AdminShell>;
}

export default function AdminPanelLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}
