"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ErrorState } from "@/components/layout/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { campaignService } from "@/services/campaigns";
import { CampaignWizard } from "./campaign-wizard";

export function EditDraft({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["campaign", id], queryFn: () => campaignService.get(id) });
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.data.status !== "DRAFT") {
    return (
      <EmptyState
        title="This campaign is already published"
        action={
          <Button asChild>
            <Link href={`/brand/campaigns/${id}`}>Back to campaign</Link>
          </Button>
        }
      >
        Published campaigns keep their budget floor, platform and milestones. You can still edit the name, brief and deadline, or top up the budget.
      </EmptyState>
    );
  }
  return (
    <>
      <PageHeader title="Edit draft" description={q.data.name} />
      <CampaignWizard draft={q.data} />
    </>
  );
}
