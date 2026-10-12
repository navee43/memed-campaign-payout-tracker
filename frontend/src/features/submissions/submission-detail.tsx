"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, ChevronLeft, ExternalLink, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { FundingBadge } from "@/components/domain/badges";
import { Metric } from "@/components/domain/metric";
import { MilestoneLadder } from "@/components/domain/milestone-ladder";
import { PlatformTag } from "@/components/domain/platform";
import { ErrorState } from "@/components/layout/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ViewsChart } from "@/features/charts/charts";
import { usePublicConfig } from "@/hooks/use-config";
import { formatDateTime, formatINR, formatNumber, formatRelative } from "@/lib/format";
import { submissionService } from "@/services/submissions";
import type { Role, SubmissionDetail } from "@/types/api";
import { SimulateViewsDialog, useAcknowledgeAnomaly } from "./submission-dialogs";

export function SubmissionDetailView({ id, viewer }: { id: string; viewer: Role }) {
  const q = useQuery({ queryKey: ["submission", id], queryFn: () => submissionService.get(id) });
  const config = usePublicConfig();
  const [simOpen, setSimOpen] = useState(false);

  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const s = q.data;
  const back = viewer === "BRAND" ? { href: `/brand/campaigns/${s.campaignId}`, label: s.campaign?.name ?? "Campaign" } : { href: "/creator/submissions", label: "My posts" };

  return (
    <div className="flex flex-col gap-6">
      <Link href={back.href} className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> {back.label}
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <PlatformTag platform={s.platform} />
            {s.status === "REJECTED" ? <Badge tone="danger">Rejected</Badge> : <FundingBadge status={s.fundingStatus} />}
          </div>
          <h1 className="mt-2 font-display text-[40px]">{viewer === "BRAND" ? `Post by ${s.creatorName ?? "creator"}` : (s.campaign?.name ?? "Your post")}</h1>
          <a href={s.postUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-flex items-center gap-1 break-all text-sm text-indigo hover:underline">
            {s.postUrl} <ExternalLink className="size-3.5 shrink-0" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
        {config.data?.viewSimulationEnabled && s.status === "ACTIVE" && s.campaign && (s.campaign.status === "LIVE" || s.campaign.status === "PAUSED") && (
          <>
            <Button variant="outline" onClick={() => setSimOpen(true)}>
              <Activity /> Simulate views
            </Button>
            {simOpen && <SimulateViewsDialog submission={s} open={simOpen} onOpenChange={setSimOpen} />}
          </>
        )}
      </header>

      {s.status === "REJECTED" && (
        <div role="status" className="rounded-lg border border-danger/30 bg-danger-tint px-4 py-3 text-sm">
          <span className="font-semibold">Rejected by the brand:</span> {s.rejectedReason}
        </div>
      )}
      {s.anomaly.flagged && <AnomalyNotice submission={s} viewer={viewer} />}

      <Panel>
        <PanelBody className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <Metric label="Views" value={formatNumber(s.currentViews)} hint={`Updated ${formatRelative(s.lastViewUpdateAt)}`} />
          <Metric label="Eligible (per ladder)" value={formatINR(s.eligiblePaise)} />
          <Metric label="Committed from budget" value={formatINR(s.allocatedPaise)} money hint={s.shortfallPaise > 0 ? `${formatINR(s.shortfallPaise)} waiting for a budget top-up` : undefined} />
          <Metric label="Paid out" value={formatINR(s.paidPaise)} hint="Bank disbursement isn’t connected yet." />
        </PanelBody>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Panel>
          <PanelHeader title="Views over time" description="Each point is an accepted view snapshot. Dashed lines are milestones." />
          <PanelBody>
            {(s.viewHistory?.length ?? 0) < 2 ? (
              <p className="text-sm text-muted">The chart appears after the first view update.</p>
            ) : (
              <ViewsChart history={s.viewHistory ?? []} milestones={s.milestones} />
            )}
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Milestone progress" />
          <PanelBody>
            <MilestoneLadder milestones={s.milestones} views={s.currentViews} />
            {s.nextMilestone && (
              <p className="mt-4 text-sm">
                <span className="tabular font-semibold">{formatNumber(s.nextMilestone.views - s.currentViews)}</span> more views to reach {formatINR(s.nextMilestone.payoutPaise)}.
              </p>
            )}
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Payout history" description="Every amount committed to this post, in order." />
        {s.ledger.length === 0 ? (
          <PanelBody>
            <p className="text-sm text-muted">Nothing committed yet. The first payout lands when the post reaches {s.milestones[0] ? `${formatNumber(s.milestones[0].views)} views` : "its first milestone"}.</p>
          </PanelBody>
        ) : (
          <Table>
            <THead className="border-b border-line bg-paper">
              <TR>
                <TH>#</TH>
                <TH>When</TH>
                <TH className="text-right">Views then</TH>
                <TH className="text-right">Amount</TH>
                <TH>Note</TH>
              </TR>
            </THead>
            <TBody>
              {s.ledger.map((l) => (
                <TR key={l.id}>
                  <TD className="tabular text-muted">{l.sequence}</TD>
                  <TD className="whitespace-nowrap">{formatDateTime(l.createdAt)}</TD>
                  <TD className="tabular text-right">{formatNumber(l.viewsAtAllocation)}</TD>
                  <TD className="tabular text-right font-bold">+{formatINR(l.amountPaise)}</TD>
                  <TD className="text-[13px] text-muted">
                    {l.type === "RECONCILIATION" ? "Back-filled after the brand topped up the budget" : l.partial ? "Budget ran short; partly funded" : "Milestone reached"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}

function AnomalyNotice({ submission, viewer }: { submission: SubmissionDetail; viewer: Role }) {
  const ack = useAcknowledgeAnomaly(submission);
  const reviewed = Boolean(submission.anomaly.reviewedAt);
  return (
    <div role="status" className={reviewed ? "rounded-lg border border-line bg-surface px-4 py-3" : "rounded-lg border border-danger/30 bg-danger-tint px-4 py-3"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          {reviewed ? <ShieldCheck className="mt-0.5 size-5 text-muted" aria-hidden /> : <AlertTriangle className="mt-0.5 size-5 text-danger" aria-hidden />}
          <div className="text-sm">
            <div className="font-semibold">{reviewed ? `View spike reviewed ${formatRelative(submission.anomaly.reviewedAt)}` : "Unusual view spike"}</div>
            <p className="text-ink">{submission.anomaly.reason}</p>
            <p className="mt-1 text-muted">
              Detected {formatDateTime(submission.anomaly.detectedAt)}. This is an automatic heuristic and can be wrong — viral posts trip it too. It doesn’t remove the post or
              block earnings.
            </p>
          </div>
        </div>
        {viewer === "BRAND" && !reviewed && (
          <Button variant="outline" size="sm" loading={ack.isPending} onClick={() => ack.mutate()}>
            <ShieldCheck /> Mark as reviewed
          </Button>
        )}
      </div>
    </div>
  );
}
