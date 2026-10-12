import type { Metadata } from "next";
import { BrandCampaignList } from "@/features/campaigns/brand-campaign-list";

export const metadata: Metadata = { title: "Campaigns" };
export default function Page() {
  return <BrandCampaignList />;
}
