import type { Metadata } from "next";
import { CreatorCampaignDetail } from "@/features/campaigns/creator-campaign-detail";

export const metadata: Metadata = { title: "Campaign" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CreatorCampaignDetail id={id} />;
}
