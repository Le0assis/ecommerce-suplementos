import { LoginForm } from "@/components/admin/login-form";
import { currentAdminView } from "@/server/admin-current";
import { redirect } from "next/navigation";
import { Suspense } from "react";

async function BounceIfSignedIn() {
  const session = await currentAdminView();
  if (session) redirect("/admin");
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
