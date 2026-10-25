import { OrderEditor } from "@/components/admin/detail-editors";

export const metadata = { title: "Pedido" };

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderEditor orderId={id} />;
}
