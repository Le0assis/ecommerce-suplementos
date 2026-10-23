import { InfluencerEditor } from "@/components/admin/detail-editors";

export const metadata = { title: "Influencer" };

export default async function AdminInfluencerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InfluencerEditor influencerId={id} />;
}
