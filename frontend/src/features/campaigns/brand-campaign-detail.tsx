"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronLeft, CircleCheck, Pause, Pencil, Play, PlusCircle, ScrollText, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { CampaignStatusBadge, FUNDING_LABEL } from "@/components/domain/badges";
import { BudgetMeter } from "@/components/domain/budget-meter";
import { CampaignCover } from "@/components/domain/campaign-cover";
import { Metric } from "@/components/domain/metric";
import { MilestoneLadder } from "@/components/domain/milestone-ladder";
import { PlatformTag } from "@/components/domain/platform";
import { EmptyState, ErrorState } from "@/components/layout/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DailyMoneyChart, MilestoneDistributionChart } from "@/features/charts/charts";
import { BrandSubmissionsTable } from "@/features/submissions/brand-submissions-table";
import { errorMessage } from "@/lib/api";
import { formatCompact, formatDate, formatDateTime, formatINR, formatNumber } from "@/lib/format";
import { campaignService } from "@/services/campaigns";
import type { Campaign, CampaignStatus, FundingStatus } from "@/types/api";
import { ConfirmDialog, EditDetailsDialog, TopUpDialog } from "./campaign-dialogs";

export function BrandCampaignDetail({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["campaign", id], queryFn: () => campaignService.get(id) });

  if (q.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-36" />
        <Skeleton className="h-48" />
        <Skeleton className="h-80" />
      </div>
    );
  }
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const c = q.data;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/brand/campaigns" className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> All campaigns
      </Link>

      <CampaignHeader campaign={c} />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Panel>
          <PanelHeader title="Budget" description="Committed amounts are reserved for creators the moment a milestone is reached." />
          <PanelBody>
            <BudgetMeter budget={c.budget} />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Payout ladder" description={c.status === "DRAFT" ? "Editable until you publish." : "Locked: creators rely on these terms."} />
          <PanelBody>
            <MilestoneLadder milestones={c.milestones} size="sm" caption="A post earns the highest milestone it reaches, not the sum." />
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <Tabs defaultValue="posts">
          <TabsList className="px-3">
            <TabsTrigger value="posts">Posts ({formatNumber(c.submissionCount)})</TabsTrigger>
            <TabsTrigger value="ledger">Payout ledger</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>
          <TabsContent value="posts" className="pt-0">
            <BrandSubmissionsTable campaignId={c.id} />
          </TabsContent>
          <TabsContent value="ledger" className="pt-0">
            <LedgerTable campaignId={c.id} />
          </TabsContent>
          <TabsContent value="analytics" className="px-5 pb-5">
            <Analytics campaignId={c.id} />
          </TabsContent>
        </Tabs>
      </Panel>
    </div>
  );
}

function CampaignHeader({ campaign: c }: { campaign: Campaign }) {
  const qc = useQueryClient();
  const [topUp, setTopUp] = useState(false);
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState<CampaignStatus | null>(null);
  const status = useMutation({
    mutationFn: (s: CampaignStatus) => campaignService.update(c.id, { status: s }),
    onSuccess: async (updated) => {
      await Promise.all([qc.invalidateQueries({ queryKey: ["campaign", c.id] }), qc.invalidateQueries({ queryKey: ["campaigns"] }), qc.invalidateQueries({ queryKey: ["brand"] })]);
      const msg: Record<CampaignStatus, string> = { LIVE: "Campaign is live", PAUSED: "Campaign paused", COMPLETED: "Campaign completed", DRAFT: "Saved" };
      toast.success(msg[updated.status]);
      setConfirm(null);
    },
    onError: (err) => toast.error("Couldn’t change the status", { description: errorMessage(err) }),
  });

  return (
    <Panel className="overflow-hidden">
      <CampaignCover theme={c.coverTheme} imageUrl={c.coverImageUrl} name={c.name} className="h-24" />
      <div className="flex flex-wrap items-start justify-between gap-5 p-5 sm:p-6">
        <div className="min-w-0 max-w-2xl">
          <div className="flex flex-wrap items-center gap-3">
            <CampaignStatusBadge status={c.status} />
            <PlatformTag platform={c.platform} />
          </div>
          <h1 className="mt-2 font-display text-[40px] sm:text-[52px]">{c.name}</h1>
          {c.description && <p className="mt-2 whitespace-pre-line text-muted">{c.description}</p>}
          <p className="mt-3 text-[13px] text-muted">
            {c.publishedAt ? `Published ${formatDate(c.publishedAt)}. ` : "Not published yet. "}
            {c.endsAt ? `Submissions close ${formatDateTime(c.endsAt)}.` : "No submission deadline."}
            {c.status === "LIVE" && !c.acceptingSubmissions && c.submissionsClosedReason ? ` ${c.submissionsClosedReason}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.status === "DRAFT" && (
            <>
              <Button asChild variant="outline">
                <Link href={`/brand/campaigns/${c.id}/edit`}>
                  <Pencil /> Edit draft
                </Link>
              </Button>
              <Button onClick={() => setConfirm("LIVE")}>
                <Play /> Publish
              </Button>
            </>
          )}
          {(c.status === "LIVE" || c.status === "PAUSED") && (
            <>
              <Button variant="outline" onClick={() => setEdit(true)}>
                <Pencil /> Edit details
              </Button>
              <Button variant="marigold" onClick={() => setTopUp(true)}>
                <PlusCircle /> Top up budget
              </Button>
              {c.status === "LIVE" ? (
                <Button variant="outline" onClick={() => setConfirm("PAUSED")}>
                  <Pause /> Pause
                </Button>
              ) : (
                <Button variant="outline" onClick={() => status.mutate("LIVE")} loading={status.isPending}>
                  <Play /> Resume
                </Button>
              )}
              <Button variant="ghost" onClick={() => setConfirm("COMPLETED")}>
                <CircleCheck /> Complete
              </Button>
            </>
          )}
        </div>
      </div>

      {(c.status === "LIVE" || c.status === "PAUSED") && (
        <>
          <TopUpDialog campaign={c} open={topUp} onOpenChange={setTopUp} />
          <EditDetailsDialog campaign={c} open={edit} onOpenChange={setEdit} />
        </>
      )}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        loading={status.isPending}
        onConfirm={() => confirm && status.mutate(confirm)}
        title={confirm === "LIVE" ? "Publish this campaign?" : confirm === "PAUSED" ? "Pause new submissions?" : "Complete this campaign?"}
        description={
          confirm === "LIVE"
            ? "Creators will be able to find it and submit posts. Budget floor, platform and milestones become locked."
            : confirm === "PAUSED"
              ? "No new posts can be submitted while paused. Posts already submitted keep tracking views and earning."
              : "This is final. View tracking stops and no further payouts are committed. Amounts already committed stay with creators."
        }
        confirmLabel={confirm === "LIVE" ? "Publish" : confirm === "PAUSED" ? "Pause" : "Complete campaign"}
        tone={confirm === "COMPLETED" ? "danger" : "primary"}
      />
    </Panel>
  );
}

function LedgerTable({ campaignId }: { campaignId: string }) {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["campaign", campaignId, "ledger", page], queryFn: () => campaignService.ledger(campaignId, { page, pageSize: 15 }), placeholderData: keepPreviousData });
  if (q.isLoading) return <SkeletonRows rows={4} className="p-5" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} className="m-5" />;
  if (!q.data || q.data.items.length === 0)
    return (
      <EmptyState icon={<ScrollText />} title="No payouts committed yet" className="m-5">
        Every allocation is recorded here, once, with the views and budget at that moment.
      </EmptyState>
    );
  return (
    <>
      <p className="px-5 py-3 text-[13px] text-muted">Append-only: entries are never edited or deleted. Each line is the amount added at that moment, not a running total.</p>
      <Table>
        <THead className="border-y border-line bg-paper">
          <TR>
            <TH>When</TH>
            <TH>Creator</TH>
            <TH className="text-right">Views then</TH>
            <TH className="text-right">Amount</TH>
            <TH className="text-right">Post total</TH>
            <TH className="text-right">Campaign total</TH>
          </TR>
        </THead>
        <TBody>
          {q.data.items.map((l) => (
            <TR key={l.id}>
              <TD className="whitespace-nowrap text-muted">{formatDateTime(l.createdAt)}</TD>
              <TD>
                <Link href={`/brand/submissions/${l.submissionId}`} className="font-semibold hover:text-indigo hover:underline">
                  {l.creatorName}
                </Link>
                <div className="flex gap-1.5">
                  {l.type === "RECONCILIATION" && <Badge tone="indigo">Back-filled after top-up</Badge>}
                  {l.partial && <Badge tone="warn">Partly funded</Badge>}
                </div>
              </TD>
              <TD className="tabular text-right">{formatNumber(l.viewsAtAllocation)}</TD>
              <TD className="tabular text-right font-bold">+{formatINR(l.amountPaise)}</TD>
              <TD className="tabular text-right text-muted">
                {formatINR(l.allocatedPaiseAfter)} / {formatINR(l.eligiblePaiseAfter)}
              </TD>
              <TD className="tabular text-right text-muted">{formatINR(l.campaignAllocatedPaiseAfter)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <div className="border-t border-line">
        <Pagination meta={q.data.meta} onPage={setPage} label="entries" />
      </div>
    </>
  );
}

function Analytics({ campaignId }: { campaignId: string }) {
  const q = useQuery({ queryKey: ["campaign", campaignId, "analytics"], queryFn: () => campaignService.analytics(campaignId) });
  if (q.isLoading) return <SkeletonRows rows={3} />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const a = q.data;
  const funding: FundingStatus[] = ["FULLY_FUNDED", "PARTIALLY_FUNDED", "UNFUNDED", "NOT_ELIGIBLE"];
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <Metric label="Views across posts" value={formatCompact(a.totals.views)} />
        <Metric label="Committed" value={formatINR(a.totals.allocatedPaise)} money />
        <Metric label="Earned but awaiting budget" value={formatINR(a.totals.unfundedEntitlementPaise)} hint={a.totals.unfundedEntitlementPaise > 0 ? "Top up to pay these creators." : undefined} />
        <Metric label="Spikes to review" value={formatNumber(a.totals.unreviewedFlags)} hint={`${formatNumber(a.totals.flaggedSubmissions)} flagged in total`} />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h3 className="font-bold">Payouts committed per day</h3>
          <p className="mb-3 text-[13px] text-muted">Last 30 days, from the ledger.</p>
          {a.dailyAllocations.length === 0 ? <p className="text-sm text-muted">Nothing committed in the last 30 days.</p> : <DailyMoneyChart data={a.dailyAllocations} name="Committed" />}
        </section>
        <section>
          <h3 className="font-bold">Posts by highest milestone reached</h3>
          <p className="mb-3 text-[13px] text-muted">Where submitted posts currently sit on the ladder.</p>
          <MilestoneDistributionChart data={a.milestoneDistribution.map((m) => ({ label: m.views === 0 ? "None yet" : `${formatCompact(m.views)}+`, count: m.count }))} />
        </section>
      </div>

      <section>
        <h3 className="font-bold">Funding status</h3>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {funding.map((f) => (
            <li key={f} className="rounded-md border border-line px-4 py-3">
              <div className="text-[13px] text-muted">{FUNDING_LABEL[f]}</div>
              <div className="tabular text-2xl font-bold">{formatNumber(a.fundingBreakdown[f] ?? 0)}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className={a.integrity.consistent ? "rounded-md bg-success-tint px-4 py-3" : "rounded-md bg-danger-tint px-4 py-3"}>
        <div className="flex items-center gap-2 font-semibold">
          {a.integrity.consistent ? <CheckCircle2 className="size-5 text-success" aria-hidden /> : <ShieldAlert className="size-5 text-danger" aria-hidden />}
          {a.integrity.consistent ? "Books balance" : "Ledger mismatch detected"}
        </div>
        <p className="mt-1 text-sm">
          Ledger total {formatINR(a.integrity.ledgerTotalPaise)}, campaign committed {formatINR(a.integrity.campaignAllocatedPaise)}, sum of posts{" "}
          {formatINR(a.integrity.submissionsAllocatedPaise)}.{" "}
          {a.integrity.withinBudget ? "Within budget." : (
            <span className="inline-flex items-center gap-1 font-semibold text-danger">
              <AlertTriangle className="size-4" /> Over budget
            </span>
          )}
        </p>
      </section>
    </div>
  );
}
