"use client";

import { useQuery } from "@tanstack/react-query";
import { Compass, Trophy } from "lucide-react";
import Link from "next/link";
import { FundingBadge } from "@/components/domain/badges";
import { Metric } from "@/components/domain/metric";
import { MilestoneProgress } from "@/components/domain/milestone-progress";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ErrorState } from "@/components/layout/states";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DailyMoneyChart } from "@/features/charts/charts";
import { useMe } from "@/hooks/use-auth";
import { formatCompact, formatINR, formatNumber, formatRelative } from "@/lib/format";
import { earningsService, submissionService } from "@/services/submissions";

export function CreatorEarnings() {
  const me = useMe();
  const summary = useQuery({ queryKey: ["earnings", "summary"], queryFn: earningsService.summary });
  const history = useQuery({ queryKey: ["earnings", "history"], queryFn: () => earningsService.history({ pageSize: 1, days: 30 }) });
  const active = useQuery({ queryKey: ["submissions", "mine", { sort: "views", pageSize: 5 }], queryFn: () => submissionService.mine({ sort: "views", pageSize: 5 }) });

  return (
    <>
      <PageHeader
        title="Earnings"
        description={`${me.data?.name ?? "Your page"}: what your posts have earned so far, straight from the payout ledger.`}
        actions={
          <Button asChild variant="outline">
            <Link href="/creator/discover">
              <Compass /> Find campaigns
            </Link>
          </Button>
        }
      />

      {summary.isLoading ? (
        <div className="grid gap-6">
          <Skeleton className="h-32" />
          <Skeleton className="h-72" />
        </div>
      ) : summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : summary.data && summary.data.totals.submissions === 0 ? (
        <EmptyState
          icon={<Compass />}
          title="Your earnings start with one post"
          action={
            <Button asChild>
              <Link href="/creator/discover">Browse live campaigns</Link>
            </Button>
          }
        >
          Find a campaign, publish a post on Instagram or YouTube, then submit the link. Payouts are committed as your views cross each milestone.
        </EmptyState>
      ) : summary.data ? (
        <div className="flex flex-col gap-6">
          <Panel>
            <PanelBody className="grid grid-cols-2 gap-6 lg:grid-cols-4">
              <Metric label="Committed earnings" value={formatINR(summary.data.totals.allocatedPaise)} money hint="Reserved for you from campaign budgets." />
              <Metric label="Eligible by milestones" value={formatINR(summary.data.totals.eligiblePaise)} hint="What the ladders entitle you to." />
              <Metric
                label="Waiting for budget"
                value={formatINR(summary.data.totals.awaitingBudgetPaise)}
                hint={summary.data.totals.underfundedSubmissions > 0 ? `${summary.data.totals.underfundedSubmissions} post${summary.data.totals.underfundedSubmissions === 1 ? " is" : "s are"} first in line if the brand tops up.` : "Nothing waiting."}
              />
              <Metric label="Paid to your bank" value={formatINR(summary.data.totals.paidPaise)} hint="Disbursement isn’t connected in this release." />
            </PanelBody>
            <div className="grid grid-cols-3 gap-6 border-t border-line px-5 py-4 text-sm">
              <div>
                <div className="text-muted">Posts</div>
                <div className="tabular font-bold">{formatNumber(summary.data.totals.submissions)}</div>
              </div>
              <div>
                <div className="text-muted">Still tracking</div>
                <div className="tabular font-bold">{formatNumber(summary.data.totals.activeSubmissions)}</div>
              </div>
              <div>
                <div className="text-muted">Total views</div>
                <div className="tabular font-bold">{formatCompact(summary.data.totals.views)}</div>
              </div>
            </div>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <Panel>
              <PanelHeader title="Committed per day" description="Last 30 days." />
              <PanelBody>
                {history.isLoading ? (
                  <Skeleton className="h-56" />
                ) : history.isError ? (
                  <ErrorState error={history.error} onRetry={() => void history.refetch()} />
                ) : (history.data?.daily.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted">No payouts in the last 30 days yet.</p>
                ) : (
                  <DailyMoneyChart data={history.data!.daily} name="Committed" />
                )}
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Recent activity" />
              {summary.data.recentActivity.length === 0 ? (
                <PanelBody>
                  <p className="text-sm text-muted">Payouts show up here when a post reaches a milestone.</p>
                </PanelBody>
              ) : (
                <ul className="divide-y divide-line">
                  {summary.data.recentActivity.map((a) => (
                    <li key={a.id}>
                      <Link href={`/creator/submissions/${a.submissionId}`} className="flex items-start justify-between gap-3 px-5 py-3 hover:bg-paper">
                        <div className="min-w-0 text-sm">
                          <div className="truncate font-semibold">{a.campaignName}</div>
                          <div className="text-muted">
                            {a.type === "RECONCILIATION" ? "Back-filled after a top-up" : `Milestone at ${formatCompact(a.viewsAtAllocation)} views`}
                            {a.partial ? ", partly funded" : ""}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="tabular font-bold">+{formatINR(a.amountPaise)}</div>
                          <div className="text-[12px] text-muted">{formatRelative(a.createdAt)}</div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
            {summary.data.topSubmission && (
              <Panel>
                <PanelHeader title="Best-performing post" />
                <PanelBody className="flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-marigold text-ink" aria-hidden>
                      <Trophy className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <Link href={`/creator/submissions/${summary.data.topSubmission.id}`} className="font-semibold hover:text-indigo hover:underline">
                        {summary.data.topSubmission.campaign?.name}
                      </Link>
                      <div className="tabular text-sm text-muted">
                        {formatNumber(summary.data.topSubmission.currentViews)} views, {formatINR(summary.data.topSubmission.allocatedPaise)} committed
                      </div>
                    </div>
                  </div>
                  <MilestoneProgress submission={summary.data.topSubmission} />
                </PanelBody>
              </Panel>
            )}
            <Panel className={summary.data.topSubmission ? undefined : "lg:col-span-2"}>
              <PanelHeader title="Earnings by campaign" />
              <Table>
                <THead className="border-b border-line bg-paper">
                  <TR>
                    <TH>Campaign</TH>
                    <TH className="text-right">Posts</TH>
                    <TH className="text-right">Views</TH>
                    <TH className="text-right">Committed</TH>
                  </TR>
                </THead>
                <TBody>
                  {summary.data.byCampaign.map((c) => (
                    <TR key={c.campaignId}>
                      <TD>
                        <Link href={`/creator/campaigns/${c.campaignId}`} className="font-semibold hover:text-indigo hover:underline">
                          {c.name}
                        </Link>
                      </TD>
                      <TD className="tabular text-right">{formatNumber(c.submissions)}</TD>
                      <TD className="tabular text-right">{formatCompact(c.views)}</TD>
                      <TD className="tabular text-right">
                        <span className="font-bold">{formatINR(c.allocatedPaise)}</span>
                        {c.eligiblePaise > c.allocatedPaise && <div className="text-[12px] text-marigold-deep">of {formatINR(c.eligiblePaise)} eligible</div>}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Panel>
          </div>

          <Panel>
            <PanelHeader
              title="Next milestones"
              description="Your posts with the most views."
              action={
                <Button asChild variant="link">
                  <Link href="/creator/submissions">All posts</Link>
                </Button>
              }
            />
            {active.isError ? (
              <PanelBody>
                <ErrorState error={active.error} onRetry={() => void active.refetch()} />
              </PanelBody>
            ) : (
              <ul className="divide-y divide-line">
                {(active.data?.items ?? []).map((s) => (
                  <li key={s.id}>
                    <Link href={`/creator/submissions/${s.id}`} className="grid gap-3 px-5 py-4 hover:bg-paper sm:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)_auto] sm:items-center">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{s.campaign?.name}</div>
                        <div className="tabular text-[13px] text-muted">{formatNumber(s.currentViews)} views</div>
                      </div>
                      <MilestoneProgress submission={s} />
                      <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                        <span className="tabular font-bold">{formatINR(s.allocatedPaise)}</span>
                        <FundingBadge status={s.fundingStatus} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}
    </>
  );
}
