import { LoginForm } from "@/components/admin/login-form";
import { loadAdminGate } from "@/server/admin-current";
import { redirect } from "next/navigation";
import { Suspense } from "react";

async function BounceIfSignedIn() {
  const gate = await loadAdminGate();
  if (gate.kind === "user") redirect("/admin");
  return null;
}

export default function AdminLoginPage() {
  return (
    <>
      <Suspense fallback={null}>
        <BounceIfSignedIn />
      </Suspense>
      <LoginForm />
    </>
  );
}
