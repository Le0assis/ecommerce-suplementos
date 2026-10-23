import { AdminLoading, AdminShell } from "@/components/admin/shell";
import { currentAdminView } from "@/server/admin-current";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";

async function Gate({ children }: { children: ReactNode }) {
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
