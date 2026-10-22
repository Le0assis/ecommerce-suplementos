import { OrderResult } from "@/components/account/account-views";
import { Suspense } from "react";

export const metadata = { title: "Pedido" };

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<p className="px-4 py-10">Abrindo o pedido…</p>}>
      <OrderResult />
    </Suspense>
  );
}
