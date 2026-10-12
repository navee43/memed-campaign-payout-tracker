import type { Metadata } from "next";
import { BrandCampaignDetail } from "@/features/campaigns/brand-campaign-detail";

export const metadata: Metadata = { title: "Campaign" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BrandCampaignDetail id={id} />;
}
