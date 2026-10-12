"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FilePlus2, Megaphone } from "lucide-react";
import Link from "next/link";
import { CampaignStatusBadge } from "@/components/domain/badges";
import { BudgetMeter } from "@/components/domain/budget-meter";
import { Metric } from "@/components/domain/metric";
import { PlatformTag } from "@/components/domain/platform";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ErrorState } from "@/components/layout/states";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { BudgetSplitChart } from "@/features/charts/charts";
import { useMe } from "@/hooks/use-auth";
import { formatCompact, formatINR, formatNumber, formatRelative } from "@/lib/format";
import { campaignService } from "@/services/campaigns";

export function BrandOverview() {
  const me = useMe();
  const q = useQuery({ queryKey: ["brand", "summary"], queryFn: campaignService.brandSummary });

  return (
    <>
      <PageHeader
        title="Overview"
        description={`${me.data?.name ?? "Your brand"}: where your campaign money stands right now, and what needs your attention.`}
        actions={
          <Button asChild>
            <Link href="/brand/campaigns/new">
              <FilePlus2 /> New campaign
            </Link>
          </Button>
        }
      />

      {q.isLoading ? (
        <div className="grid gap-5">
          <Skeleton className="h-40" />
          <Skeleton className="h-72" />
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data && Object.keys(q.data.campaignsByStatus).length === 0 ? (
        <EmptyState
          icon={<Megaphone />}
          title="Launch your first campaign"
          action={
            <Button asChild>
              <Link href="/brand/campaigns/new">Create a campaign</Link>
            </Button>
          }
        >
          Set a budget and a ladder of view milestones. Creators can submit posts as soon as it’s live.
        </EmptyState>
      ) : q.data ? (
        <div className="flex flex-col gap-6">
          {q.data.submissions.unreviewedFlags > 0 && (
            <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-danger/30 bg-danger-tint px-4 py-3 text-sm">
              <AlertTriangle className="size-5 text-danger" aria-hidden />
              <span className="font-semibold">
                {q.data.submissions.unreviewedFlags} post{q.data.submissions.unreviewedFlags === 1 ? " has" : "s have"} an unusual view spike to review.
              </span>
              <span className="text-muted">Flags are a heuristic; payouts are not blocked.</span>
            </div>
          )}

          <Panel>
            <PanelHeader title="Budget across published campaigns" description="Drafts aren’t counted until they go live." />
            <PanelBody className="flex flex-col gap-6">
              <BudgetMeter budget={q.data.budget} />
              <div className="grid grid-cols-2 gap-6 border-t border-line pt-5 sm:grid-cols-4">
                <Metric label="Live campaigns" value={formatNumber(q.data.campaignsByStatus.LIVE ?? 0)} />
                <Metric label="Drafts" value={formatNumber(q.data.campaignsByStatus.DRAFT ?? 0)} />
                <Metric label="Posts submitted" value={formatNumber(q.data.submissions.count)} />
                <Metric label="Views tracked" value={formatCompact(q.data.submissions.views)} />
              </div>
            </PanelBody>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Panel>
              <PanelHeader title="Where the money is going" description="Active campaigns, by amount committed." />
              <PanelBody>
                {q.data.activeCampaigns.length === 0 ? (
                  <p className="text-sm text-muted">No live or paused campaigns yet.</p>
                ) : (
                  <>
                    <BudgetSplitChart
                      data={q.data.activeCampaigns.map((c) => ({ name: c.name.length > 22 ? `${c.name.slice(0, 21)}…` : c.name, committed: c.budget.allocatedPaise, remaining: c.budget.remainingPaise }))}
                    />
                    <ul className="mt-5 divide-y divide-line border-t border-line">
                      {q.data.activeCampaigns.map((c) => (
                        <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <Link href={`/brand/campaigns/${c.id}`} className="font-semibold hover:text-indigo hover:underline">
                              {c.name}
                            </Link>
                            <div className="mt-0.5 flex items-center gap-3">
                              <PlatformTag platform={c.platform} />
                              <CampaignStatusBadge status={c.status} />
                            </div>
                          </div>
                          <div className="tabular text-right text-sm">
                            <div className="font-semibold">{formatINR(c.budget.allocatedPaise)}</div>
                            <div className="text-muted">of {formatINR(c.budget.budgetPaise)}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Latest payouts committed" description="Newest ledger entries across your campaigns." />
              <PanelBody className="p-0">
                {q.data.recentAllocations.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-muted">Payouts appear here when a post reaches its first milestone.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {q.data.recentAllocations.map((a) => (
                      <li key={a.id} className="flex items-start justify-between gap-3 px-5 py-3">
                        <div className="min-w-0 text-sm">
                          <div className="truncate font-semibold">{a.creatorName}</div>
                          <div className="truncate text-muted">
                            {a.campaignName}
                            {a.type === "RECONCILIATION" ? ", back-filled after top-up" : ""}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="tabular font-bold">+{formatINR(a.amountPaise)}</div>
                          <div className="text-[12px] text-muted">{formatRelative(a.createdAt)}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </PanelBody>
            </Panel>
          </div>
        </div>
      ) : null}
    </>
  );
}
