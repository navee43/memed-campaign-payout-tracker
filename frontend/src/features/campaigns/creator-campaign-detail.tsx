"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, CircleOff, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CampaignStatusBadge, FundingBadge } from "@/components/domain/badges";
import { BudgetMeter } from "@/components/domain/budget-meter";
import { CampaignCover } from "@/components/domain/campaign-cover";
import { MilestoneLadder } from "@/components/domain/milestone-ladder";
import { MilestoneProgress } from "@/components/domain/milestone-progress";
import { PlatformTag } from "@/components/domain/platform";
import { ErrorState } from "@/components/layout/states";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitPostDialog } from "@/features/submissions/submit-post-dialog";
import { formatDateTime, formatINR, formatNumber } from "@/lib/format";
import { campaignService } from "@/services/campaigns";
import { submissionService } from "@/services/submissions";

export function CreatorCampaignDetail({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["campaign", id], queryFn: () => campaignService.get(id) });
  const mine = useQuery({ queryKey: ["submissions", "mine", { campaignId: id }], queryFn: () => submissionService.mine({ campaignId: id, pageSize: 50, sort: "views" }) });
  const [open, setOpen] = useState(false);

  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const c = q.data;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/creator/discover" className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> Discover
      </Link>

      <Panel className="overflow-hidden">
        <CampaignCover theme={c.coverTheme} imageUrl={c.coverImageUrl} name={c.name} className="h-28" />
        <div className="flex flex-wrap items-start justify-between gap-5 p-5 sm:p-6">
          <div className="min-w-0 max-w-2xl">
            <div className="flex flex-wrap items-center gap-3">
              <PlatformTag platform={c.platform} />
              <CampaignStatusBadge status={c.status} />
            </div>
            <h1 className="mt-2 font-display text-[40px] sm:text-[52px]">{c.name}</h1>
            <p className="text-muted">by {c.brandName ?? "a brand"}</p>
            {c.description && <p className="mt-4 whitespace-pre-line text-[15px]">{c.description}</p>}
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            {c.acceptingSubmissions ? (
              <Button size="lg" onClick={() => setOpen(true)}>
                <Send /> Submit a post
              </Button>
            ) : (
              <div className="flex items-start gap-2 rounded-md bg-paper px-3 py-2 text-sm text-muted">
                <CircleOff className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{c.submissionsClosedReason ?? "Not accepting submissions."}</span>
              </div>
            )}
            {c.endsAt && <p className="text-[13px] text-muted">Submissions close {formatDateTime(c.endsAt)}</p>}
          </div>
        </div>
      </Panel>
      <SubmitPostDialog campaign={c} open={open} onOpenChange={setOpen} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="What you can earn" description="Per post. The highest milestone reached pays; payouts don’t add up." />
          <PanelBody>
            <MilestoneLadder milestones={c.milestones} />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Budget left" description="Payouts are committed first come, first served." />
          <PanelBody className="flex flex-col gap-5">
            <BudgetMeter budget={c.budget} compact />
            <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted">
              <li>Views only count upwards; an older or lower count is ignored.</li>
              <li>If the budget runs out mid-way, your post is partly funded and the rest is paid first, oldest first, if the brand tops up.</li>
              <li>Amounts shown are committed earnings. Bank payouts aren’t connected in this release.</li>
            </ul>
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Your posts in this campaign" />
        {mine.isLoading ? (
          <PanelBody>
            <Skeleton className="h-16" />
          </PanelBody>
        ) : mine.isError ? (
          <PanelBody>
            <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />
          </PanelBody>
        ) : (mine.data?.items.length ?? 0) === 0 ? (
          <PanelBody>
            <p className="text-sm text-muted">You haven’t submitted a post here yet.</p>
          </PanelBody>
        ) : (
          <ul className="divide-y divide-line">
            {mine.data!.items.map((s) => (
              <li key={s.id}>
                <Link href={`/creator/submissions/${s.id}`} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 hover:bg-paper">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-indigo">{s.postUrl.replace(/^https:\/\/(www\.)?/, "")}</div>
                    <div className="tabular text-[13px] text-muted">{formatNumber(s.currentViews)} views</div>
                  </div>
                  <MilestoneProgress submission={s} />
                  <div className="text-right">
                    <div className="tabular font-bold">{formatINR(s.allocatedPaise)}</div>
                    <FundingBadge status={s.fundingStatus} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
