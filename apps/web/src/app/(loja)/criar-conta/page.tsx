import { AuthForm } from "@/components/account/account-views";

export const metadata = { title: "Criar conta" };

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
