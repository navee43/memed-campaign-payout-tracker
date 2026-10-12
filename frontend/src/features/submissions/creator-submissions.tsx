"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Compass, Film } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AnomalyBadge, FundingBadge } from "@/components/domain/badges";
import { MilestoneProgress } from "@/components/domain/milestone-progress";
import { PlatformIcon } from "@/components/domain/platform";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ErrorState } from "@/components/layout/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { SkeletonRows } from "@/components/ui/skeleton";
import { formatINR, formatNumber, formatRelative } from "@/lib/format";
import { submissionService } from "@/services/submissions";
import type { FundingStatus } from "@/types/api";

type FundingFilter = FundingStatus | "all";

export function CreatorSubmissions() {
  const [page, setPage] = useState(1);
  const [funding, setFunding] = useState<FundingFilter>("all");
  const [sort, setSort] = useState<"newest" | "views" | "earnings">("newest");
  const query = { page, pageSize: 10, sort, fundingStatus: funding === "all" ? undefined : funding };
  const q = useQuery({ queryKey: ["submissions", "mine", query], queryFn: () => submissionService.mine(query), placeholderData: keepPreviousData });

  return (
    <>
      <PageHeader title="My posts" description="Every post you’ve submitted, where it sits on its ladder, and what it has earned." />
      <div className="mb-4 flex flex-wrap gap-3">
        <Select<FundingFilter>
          aria-label="Filter by funding"
          className="w-48"
          value={funding}
          onValueChange={(v) => {
            setFunding(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All posts" },
            { value: "FULLY_FUNDED", label: "Fully funded" },
            { value: "PARTIALLY_FUNDED", label: "Partly funded" },
            { value: "UNFUNDED", label: "Awaiting budget" },
            { value: "NOT_ELIGIBLE", label: "No milestone yet" },
          ]}
        />
        <Select<"newest" | "views" | "earnings">
          aria-label="Sort"
          className="w-44"
          value={sort}
          onValueChange={setSort}
          options={[
            { value: "newest", label: "Newest" },
            { value: "views", label: "Most views" },
            { value: "earnings", label: "Highest earning" },
          ]}
        />
      </div>
      {q.isLoading ? (
        <SkeletonRows rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data && q.data.items.length === 0 ? (
        funding !== "all" ? (
          <EmptyState icon={<Film />} title="No posts with this status" />
        ) : (
          <EmptyState
            icon={<Film />}
            title="You haven’t submitted any posts yet"
            action={
              <Button asChild>
                <Link href="/creator/discover">
                  <Compass /> Find a campaign
                </Link>
              </Button>
            }
          >
            Pick a live campaign, publish your post, then paste the link here.
          </EmptyState>
        )
      ) : q.data ? (
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-line">
            {q.data.items.map((s) => (
              <li key={s.id}>
                <Link href={`/creator/submissions/${s.id}`} className="grid gap-4 px-5 py-4 hover:bg-paper md:grid-cols-[minmax(0,1.4fr)_minmax(10rem,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold">
                      <PlatformIcon platform={s.platform} className="text-muted" />
                      <span className="truncate">{s.campaign?.name ?? "Campaign"}</span>
                    </div>
                    <div className="truncate text-[13px] text-indigo">{s.postUrl.replace(/^https:\/\/(www\.)?/, "")}</div>
                    <div className="tabular mt-1 text-[13px] text-muted">
                      {formatNumber(s.currentViews)} views, updated {formatRelative(s.lastViewUpdateAt)}
                    </div>
                  </div>
                  <MilestoneProgress submission={s} />
                  <div className="flex flex-row items-center justify-between gap-3 md:flex-col md:items-end">
                    <div className="tabular text-lg font-bold">{formatINR(s.allocatedPaise)}</div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {s.status === "REJECTED" ? <Badge tone="danger">Rejected</Badge> : <FundingBadge status={s.fundingStatus} />}
                      <AnomalyBadge anomaly={s.anomaly} />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-t border-line">
            <Pagination meta={q.data.meta} onPage={setPage} label="posts" />
          </div>
        </Panel>
      ) : null}
    </>
  );
}
