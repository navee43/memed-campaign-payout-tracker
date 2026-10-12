import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { CampaignWizard } from "@/features/campaigns/campaign-wizard";

export const metadata: Metadata = { title: "New campaign" };
export default function Page() {
  return (
    <>
      <PageHeader title="New campaign" description="Four short steps. You can save a draft at the end and publish later." />
      <CampaignWizard />
    </>
  );
}
