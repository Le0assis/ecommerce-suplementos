import { AuthForm } from "@/components/account/account-views";

export const metadata = { title: "Entrar" };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
