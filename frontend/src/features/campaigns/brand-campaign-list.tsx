"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { FilePlus2, Megaphone, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CampaignStatusBadge } from "@/components/domain/badges";
import { CampaignCover } from "@/components/domain/campaign-cover";
import { PlatformTag } from "@/components/domain/platform";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ErrorState } from "@/components/layout/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Panel } from "@/components/ui/panel";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useDebounced } from "@/hooks/use-debounced";
import { formatDate, formatINR, formatNumber } from "@/lib/format";
import { campaignService } from "@/services/campaigns";
import type { CampaignStatus, Platform } from "@/types/api";

type StatusFilter = CampaignStatus | "all";
type PlatformFilter = Platform | "all";

export function BrandCampaignList() {
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search.trim());

  const query = { page, pageSize: 10, status: status === "all" ? undefined : status, platform: platform === "all" ? undefined : platform, search: debounced || undefined };
  const q = useQuery({ queryKey: ["campaigns", "mine", query], queryFn: () => campaignService.list(query), placeholderData: keepPreviousData });
  const filtered = status !== "all" || platform !== "all" || Boolean(debounced);

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Every campaign you’ve created, with live budget usage."
        actions={
          <Button asChild>
            <Link href="/brand/campaigns/new">
              <FilePlus2 /> New campaign
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name"
            aria-label="Search campaigns by name"
            className="pl-9"
          />
        </div>
        <Select<StatusFilter>
          aria-label="Filter by status"
          className="w-40"
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All statuses" },
            { value: "LIVE", label: "Live" },
            { value: "DRAFT", label: "Draft" },
            { value: "PAUSED", label: "Paused" },
            { value: "COMPLETED", label: "Completed" },
          ]}
        />
        <Select<PlatformFilter>
          aria-label="Filter by platform"
          className="w-40"
          value={platform}
          onValueChange={(v) => {
            setPlatform(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All platforms" },
            { value: "INSTAGRAM", label: "Instagram" },
            { value: "YOUTUBE", label: "YouTube" },
          ]}
        />
      </div>

      {q.isLoading ? (
        <SkeletonRows rows={5} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data && q.data.items.length === 0 ? (
        filtered ? (
          <EmptyState icon={<Search />} title="No campaigns match these filters">
            Try a different status or platform, or clear the search.
          </EmptyState>
        ) : (
          <EmptyState
            icon={<Megaphone />}
            title="No campaigns yet"
            action={
              <Button asChild>
                <Link href="/brand/campaigns/new">Create your first campaign</Link>
              </Button>
            }
          >
            A campaign is a budget plus a ladder of view milestones.
          </EmptyState>
        )
      ) : q.data ? (
        <Panel className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Campaign</TH>
                <TH>Status</TH>
                <TH className="min-w-48">Budget committed</TH>
                <TH className="text-right">Posts</TH>
                <TH>Ends</TH>
              </TR>
            </THead>
            <TBody>
              {q.data.items.map((c) => (
                <TR key={c.id} className="cursor-pointer hover:bg-paper" onClick={() => router.push(`/brand/campaigns/${c.id}`)}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <CampaignCover theme={c.coverTheme} imageUrl={c.coverImageUrl} name={c.name} className="size-10 shrink-0 rounded-md" />
                      <div className="min-w-0">
                        <Link href={`/brand/campaigns/${c.id}`} className="font-semibold hover:text-indigo hover:underline" onClick={(e) => e.stopPropagation()}>
                          {c.name}
                        </Link>
                        <div>
                          <PlatformTag platform={c.platform} />
                        </div>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <CampaignStatusBadge status={c.status} />
                  </TD>
                  <TD>
                    <Progress value={c.budget.utilizationPct / 100} tone="marigold" label={`${c.name} budget committed`} />
                    <div className="tabular mt-1.5 text-[13px] text-muted">
                      {formatINR(c.budget.allocatedPaise)} of {formatINR(c.budget.budgetPaise)}
                    </div>
                  </TD>
                  <TD className="tabular text-right font-semibold">{formatNumber(c.submissionCount)}</TD>
                  <TD className="whitespace-nowrap text-muted">{c.endsAt ? formatDate(c.endsAt) : "No end date"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="border-t border-line">
            <Pagination meta={q.data.meta} onPage={setPage} label="campaigns" />
          </div>
        </Panel>
      ) : null}
    </>
  );
}
