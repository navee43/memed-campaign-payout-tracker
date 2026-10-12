"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ExternalLink, Eye, Film, MoreHorizontal, ShieldCheck, Ban, Activity } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AnomalyBadge, FundingBadge } from "@/components/domain/badges";
import { MilestoneProgress } from "@/components/domain/milestone-progress";
import { EmptyState, ErrorState } from "@/components/layout/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { usePublicConfig } from "@/hooks/use-config";
import { formatINR, formatNumber, formatRelative } from "@/lib/format";
import { campaignService } from "@/services/campaigns";
import type { FundingStatus, Submission } from "@/types/api";
import { RejectDialog, SimulateViewsDialog, useAcknowledgeAnomaly } from "./submission-dialogs";

type FundingFilter = FundingStatus | "all";
type FlagFilter = "all" | "flagged";

export function BrandSubmissionsTable({ campaignId }: { campaignId: string }) {
  const [page, setPage] = useState(1);
  const [funding, setFunding] = useState<FundingFilter>("all");
  const [flag, setFlag] = useState<FlagFilter>("all");
  const [sort, setSort] = useState<"newest" | "views" | "earnings">("views");
  const query = { page, pageSize: 10, sort, fundingStatus: funding === "all" ? undefined : funding, flagged: flag === "flagged" ? true : undefined };
  const q = useQuery({ queryKey: ["submissions", "campaign", campaignId, query], queryFn: () => campaignService.submissions(campaignId, query), placeholderData: keepPreviousData });
  const config = usePublicConfig();

  return (
    <div>
      <div className="flex flex-wrap gap-3 px-5 py-4">
        <Select<FundingFilter>
          aria-label="Filter by funding"
          className="w-44"
          value={funding}
          onValueChange={(v) => {
            setFunding(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: "Any funding" },
            { value: "FULLY_FUNDED", label: "Fully funded" },
            { value: "PARTIALLY_FUNDED", label: "Partly funded" },
            { value: "UNFUNDED", label: "Awaiting budget" },
            { value: "NOT_ELIGIBLE", label: "No milestone yet" },
          ]}
        />
        <Select<FlagFilter>
          aria-label="Filter by view spikes"
          className="w-44"
          value={flag}
          onValueChange={(v) => {
            setFlag(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All posts" },
            { value: "flagged", label: "Spike flagged" },
          ]}
        />
        <Select<"newest" | "views" | "earnings">
          aria-label="Sort posts"
          className="w-44"
          value={sort}
          onValueChange={setSort}
          options={[
            { value: "views", label: "Most views" },
            { value: "earnings", label: "Highest earning" },
            { value: "newest", label: "Newest" },
          ]}
        />
      </div>

      {q.isLoading ? (
        <SkeletonRows rows={4} className="px-5 pb-5" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} className="mx-5 mb-5" />
      ) : q.data && q.data.items.length === 0 ? (
        <EmptyState icon={<Film />} title={funding !== "all" || flag !== "all" ? "No posts match these filters" : "No posts submitted yet"} className="mx-5 mb-5">
          {funding !== "all" || flag !== "all" ? "Try another filter." : "Creators’ posts show up here as soon as they submit a link."}
        </EmptyState>
      ) : q.data ? (
        <>
          <Table>
            <THead className="border-y border-line bg-paper">
              <TR>
                <TH>Creator & post</TH>
                <TH className="text-right">Views</TH>
                <TH>Milestone</TH>
                <TH className="text-right">Earned</TH>
                <TH>Status</TH>
                <TH>
                  <span className="sr-only">Actions</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {q.data.items.map((s) => (
                <SubmissionRow key={s.id} s={s} simulation={Boolean(config.data?.viewSimulationEnabled)} />
              ))}
            </TBody>
          </Table>
          <div className="border-t border-line">
            <Pagination meta={q.data.meta} onPage={setPage} label="posts" />
          </div>
        </>
      ) : null}
    </div>
  );
}

function SubmissionRow({ s, simulation }: { s: Submission; simulation: boolean }) {
  const [simOpen, setSimOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const ack = useAcknowledgeAnomaly(s);
  return (
    <TR className={s.anomaly.flagged && !s.anomaly.reviewedAt ? "bg-danger-tint/40" : undefined}>
      <TD>
        <div className="font-semibold">{s.creatorName ?? "Creator"}</div>
        <a href={s.postUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-56 items-center gap-1 truncate text-[13px] text-indigo hover:underline">
          <span className="truncate">{s.postUrl.replace(/^https:\/\/(www\.)?/, "")}</span>
          <ExternalLink className="size-3 shrink-0" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        {s.anomaly.flagged && <p className="mt-1 max-w-72 text-[12px] text-danger">{s.anomaly.reason}</p>}
      </TD>
      <TD className="tabular text-right">
        <div className="font-semibold">{formatNumber(s.currentViews)}</div>
        <div className="text-[12px] text-muted">{s.lastViewUpdateAt ? formatRelative(s.lastViewUpdateAt) : "not tracked yet"}</div>
      </TD>
      <TD>
        <MilestoneProgress submission={s} />
      </TD>
      <TD className="tabular text-right">
        <div className="font-bold">{formatINR(s.allocatedPaise)}</div>
        {s.shortfallPaise > 0 && <div className="text-[12px] text-marigold-deep">of {formatINR(s.eligiblePaise)} eligible</div>}
      </TD>
      <TD>
        <div className="flex flex-col items-start gap-1">
          {s.status === "REJECTED" ? <Badge tone="danger">Rejected</Badge> : <FundingBadge status={s.fundingStatus} />}
          <AnomalyBadge anomaly={s.anomaly} />
        </div>
      </TD>
      <TD className="text-right">
        <Dropdown>
          <DropdownTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for ${s.creatorName ?? "post"}`}>
              <MoreHorizontal />
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem asChild>
              <Link href={`/brand/submissions/${s.id}`}>
                <Eye /> View details
              </Link>
            </DropdownItem>
            {s.anomaly.flagged && !s.anomaly.reviewedAt && (
              <DropdownItem onSelect={() => ack.mutate()}>
                <ShieldCheck /> Mark spike reviewed
              </DropdownItem>
            )}
            {simulation && s.status === "ACTIVE" && (
              <DropdownItem onSelect={() => setSimOpen(true)}>
                <Activity /> Simulate views
              </DropdownItem>
            )}
            {s.status === "ACTIVE" && s.allocatedPaise === 0 && (
              <DropdownItem onSelect={() => setRejectOpen(true)} className="text-danger data-[highlighted]:bg-danger-tint data-[highlighted]:text-danger">
                <Ban /> Reject post
              </DropdownItem>
            )}
          </DropdownContent>
        </Dropdown>
        {simOpen && <SimulateViewsDialog submission={s} open={simOpen} onOpenChange={setSimOpen} />}
        {rejectOpen && <RejectDialog submission={s} open={rejectOpen} onOpenChange={setRejectOpen} />}
      </TD>
    </TR>
  );
}
