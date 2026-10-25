import { ProductEditor } from "@/components/admin/product-editor";

export const metadata = { title: "Editar produto" };

export default async function AdminProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductEditor productId={id} />;
}
