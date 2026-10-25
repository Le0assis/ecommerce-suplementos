import { PostEditor } from "@/components/admin/detail-editors";

export const metadata = { title: "Post" };

export default async function AdminPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PostEditor postId={id} />;
}
